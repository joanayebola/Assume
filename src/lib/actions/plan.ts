"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { ADJUSTMENTS, type AdjustmentRequest } from "@/lib/ai/prompt";
import { getCurrentUser } from "@/lib/auth/session";
import { getBillingStore } from "@/lib/billing";
import { checkGenerationEntitlement } from "@/lib/entitlements";
import { generationUsage } from "@/lib/generation/usage";
import { generationReadiness, runGenerationRequest } from "@/lib/generation/run";
import { TECHNIQUES } from "@/lib/intake/model";
import { getPlanStore } from "@/lib/plan";
import { applyEdit, EditError, editOpSchema, type EditOp } from "@/lib/plan/edits";
import { planDocSchema, type PlanDoc } from "@/lib/plan/schema";
import { PlanConflictError, PlanNotFoundError, type GenerationKind } from "@/lib/plan/store";
import { routes } from "@/lib/site";
import { logError, logWarn } from "@/lib/log";
import { track } from "@/lib/analytics/server";

export type PlanActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; code: "auth" | "not_found" | "conflict" | "invalid" | "limit" | "payment_required" | "not_configured" | "error"; message: string };

const uuid = z.uuid();

async function requireUserId() {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

function failure(error: unknown): Extract<PlanActionResult, { ok: false }> {
  if (error instanceof PlanConflictError) {
    return { ok: false, code: "conflict", message: "Your routine changed in another tab. We've loaded the latest version." };
  }
  if (error instanceof PlanNotFoundError) return { ok: false, code: "not_found", message: "We couldn't find this routine." };
  if (error instanceof EditError) return { ok: false, code: "invalid", message: error.message };
  logError("plan", error);
  return { ok: false, code: "error", message: "We couldn't save that. Please try again." };
}

/** Kick off generation after the response is sent, so the user never waits on the model. */
function startInBackground(requestId: string) {
  after(async () => {
    await runGenerationRequest(requestId);
  });
}

async function gate(userId: string, kind: GenerationKind | "retry"): Promise<Extract<PlanActionResult, { ok: false }> | null> {
  const readiness = generationReadiness();
  if (!readiness.ready) {
    logWarn("plan", `generation not configured: ${readiness.detail}`);
    return { ok: false, code: "not_configured", message: "Routine building isn't switched on for this environment yet." };
  }
  // A retry reuses the request (and credit) it already has and adds no new request.
  if (kind === "retry") return null;
  const usage = await generationUsage(userId);
  const entitlement = await checkGenerationEntitlement(await getBillingStore(), userId, kind, usage);
  return entitlement.allowed ? null : { ok: false, code: entitlement.reason === "payment_required" ? "payment_required" : "limit", message: entitlement.message };
}

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

export async function applyPlanEdit(
  planId: string,
  expectedVersion: number,
  op: EditOp,
): Promise<PlanActionResult<{ version: number; doc: PlanDoc }>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, code: "auth", message: "Your session has expired. Log in again." };
  if (!uuid.safeParse(planId).success) return { ok: false, code: "not_found", message: "We couldn't find this routine." };
  const parsed = editOpSchema.safeParse(op);
  if (!parsed.success) return { ok: false, code: "invalid", message: parsed.error.issues[0]?.message ?? "Check your changes." };

  try {
    const store = await getPlanStore();
    const plan = await store.getPlan(userId, planId);
    if (!plan) return { ok: false, code: "not_found", message: "We couldn't find this routine." };
    if (plan.version !== expectedVersion) {
      return { ok: false, code: "conflict", message: "Your routine changed in another tab. We've loaded the latest version." };
    }
    const { doc, summary } = applyEdit(plan.doc, parsed.data);
    const valid = planDocSchema.parse(doc);
    const version = await store.saveEdit(userId, planId, valid, summary, expectedVersion);
    track("plan_edited", userId, { op: parsed.data.type });
    revalidatePath(`${routes.plans}/${planId}`);
    return { ok: true, version, doc: valid };
  } catch (error) {
    return failure(error);
  }
}

export async function restorePlanVersion(planId: string, version: number): Promise<PlanActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, code: "auth", message: "Your session has expired. Log in again." };
  if (!uuid.safeParse(planId).success || !Number.isInteger(version)) {
    return { ok: false, code: "not_found", message: "We couldn't find that version." };
  }
  try {
    const store = await getPlanStore();
    await store.restoreVersion(userId, planId, version);
    revalidatePath(`${routes.plans}/${planId}`);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// AI changes
// ---------------------------------------------------------------------------

const adjustmentSchema = z
  .object({
    kinds: z.array(z.enum(ADJUSTMENTS)).min(1, { error: "Choose at least one change." }).max(ADJUSTMENTS.length),
    removeTechniques: z.array(z.enum(TECHNIQUES)).max(TECHNIQUES.length),
    scheduleChange: z.string().trim().max(1000, { error: "Keep it under 1,000 characters." }),
    customInstruction: z.string().trim().max(1000, { error: "Keep it under 1,000 characters." }),
    keepEditedSessions: z.boolean(),
  })
  .refine((a) => !a.kinds.includes("remove_technique") || a.removeTechniques.length > 0, {
    error: "Choose which technique to remove.",
  })
  .refine((a) => !a.kinds.includes("custom") || a.customInstruction.length > 0, {
    error: "Tell us what you'd like to change.",
  }) satisfies z.ZodType<AdjustmentRequest>;

export async function requestPlanAdjustment(
  planId: string,
  adjustment: AdjustmentRequest,
): Promise<PlanActionResult<{ requestId: string }>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, code: "auth", message: "Your session has expired. Log in again." };
  if (!uuid.safeParse(planId).success) return { ok: false, code: "not_found", message: "We couldn't find this routine." };
  const parsed = adjustmentSchema.safeParse(adjustment);
  if (!parsed.success) return { ok: false, code: "invalid", message: parsed.error.issues[0]?.message ?? "Check your choices." };

  const blocked = await gate(userId, "adjust");
  if (blocked) return blocked;
  try {
    const store = await getPlanStore();
    const requestId = await store.requestChange(userId, planId, "adjust", parsed.data);
    startInBackground(requestId);
    return { ok: true, requestId };
  } catch (error) {
    return failure(error);
  }
}

export async function requestSessionRegeneration(
  planId: string,
  sessionId: string,
  note: string,
): Promise<PlanActionResult<{ requestId: string }>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, code: "auth", message: "Your session has expired. Log in again." };
  if (!uuid.safeParse(planId).success || !z.string().min(1).max(40).safeParse(sessionId).success) {
    return { ok: false, code: "not_found", message: "We couldn't find that session." };
  }
  const blocked = await gate(userId, "regenerate_session");
  if (blocked) return blocked;
  try {
    const store = await getPlanStore();
    const requestId = await store.requestChange(userId, planId, "regenerate_session", {
      sessionId,
      note: note.trim().slice(0, 500),
    });
    startInBackground(requestId);
    return { ok: true, requestId };
  } catch (error) {
    return failure(error);
  }
}

export async function retryGeneration(requestId: string): Promise<PlanActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, code: "auth", message: "Your session has expired. Log in again." };
  if (!uuid.safeParse(requestId).success) return { ok: false, code: "not_found", message: "We couldn't find that request." };
  const blocked = await gate(userId, "retry");
  if (blocked) return blocked;
  try {
    const store = await getPlanStore();
    await store.retry(userId, requestId);
    startInBackground(requestId);
    return { ok: true };
  } catch (error) {
    logError("plan:retry", error);
    return { ok: false, code: "error", message: "This one can't be retried. Try adjusting your routine instead." };
  }
}

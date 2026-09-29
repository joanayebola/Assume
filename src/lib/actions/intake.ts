"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";

import { getCurrentUser, getViewer } from "@/lib/auth/session";
import { runGenerationRequest } from "@/lib/generation/run";
import { track } from "@/lib/analytics/server";
import { getBillingStore } from "@/lib/billing";
import { rateLimited, reserveInitialGeneration } from "@/lib/entitlements";
import { generationUsage } from "@/lib/generation/usage";
import { getIntakeDefaults } from "@/lib/data/intake-defaults";
import { getIntakeRepository } from "@/lib/intake";
import { prefilledSections } from "@/lib/intake/defaults";
import { SECTION_KEYS, STEP_KEYS, type SectionKey, type StepKey } from "@/lib/intake/model";
import { IntakeLockedError, IntakeNotFoundError } from "@/lib/intake/repository";
import { completionIssues, firstIncompleteSection, issuesFromZod, parseSection, type Issues } from "@/lib/intake/schema";
import { buildSnapshot } from "@/lib/intake/snapshot";
import { routes } from "@/lib/site";
import { logError } from "@/lib/log";

export type SaveResult =
  | { ok: true; savedAt: string }
  | { ok: false; code: "auth" | "not_found" | "locked" | "invalid" | "error"; message: string; issues?: Issues };

const intakeId = z.uuid();

function failure(error: unknown): Extract<SaveResult, { ok: false }> {
  if (error instanceof IntakeNotFoundError) {
    return { ok: false, code: "not_found", message: "We couldn't find this plan." };
  }
  if (error instanceof IntakeLockedError) {
    return { ok: false, code: "locked", message: "This plan has already been submitted." };
  }
  logError("intake", error);
  return { ok: false, code: "error", message: "We couldn't save that. We'll keep trying." };
}

async function userId() {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

export async function startIntake() {
  const uid = await userId();
  if (!uid) redirect(routes.login);
  const repo = await getIntakeRepository();
  const id = await repo.create(uid);
  // Start from their saved preferences (Settings → Manifestation preferences).
  try {
    const prefill = prefilledSections(await getIntakeDefaults(uid));
    for (const [key, data] of Object.entries(prefill) as [SectionKey, unknown][]) {
      const parsed = parseSection(key, data);
      if (parsed.success) await repo.saveSection(uid, id, key, parsed.data);
    }
  } catch (error) {
    logError("intake:prefill", error); // an empty intake is still a fine start
  }
  track("intake_started", uid);
  redirect(`${routes.newPlan}/${id}`);
}

export async function saveIntakeSection(input: {
  intakeId: string;
  section: SectionKey;
  data: unknown;
}): Promise<SaveResult> {
  const uid = await userId();
  if (!uid) return { ok: false, code: "auth", message: "Your session has expired. Log in again to keep saving." };

  const id = intakeId.safeParse(input.intakeId);
  const section = z.enum(SECTION_KEYS).safeParse(input.section);
  if (!id.success || !section.success) return { ok: false, code: "invalid", message: "Invalid request." };

  const parsed = parseSection(section.data, input.data);
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: "Some answers are too long to save.", issues: issuesFromZod(parsed.error) };
  }

  try {
    const repo = await getIntakeRepository();
    await repo.saveSection(uid, id.data, section.data, parsed.data);
    return { ok: true, savedAt: new Date().toISOString() };
  } catch (error) {
    return failure(error);
  }
}

export async function saveIntakeProgress(input: {
  intakeId: string;
  currentStep: StepKey;
  completedSteps: StepKey[];
}): Promise<SaveResult> {
  const uid = await userId();
  if (!uid) return { ok: false, code: "auth", message: "Your session has expired." };

  const parsed = z
    .object({
      intakeId,
      currentStep: z.enum(STEP_KEYS),
      completedSteps: z.array(z.enum(STEP_KEYS)).max(STEP_KEYS.length),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid", message: "Invalid request." };

  try {
    const repo = await getIntakeRepository();
    await repo.saveProgress(uid, parsed.data.intakeId, {
      currentStep: parsed.data.currentStep,
      completedSteps: [...new Set(parsed.data.completedSteps)],
    });
    return { ok: true, savedAt: new Date().toISOString() };
  } catch (error) {
    return failure(error);
  }
}

export type SubmitResult = {
  ok: false;
  code: "auth" | "not_found" | "locked" | "incomplete" | "payment_required" | "limit" | "error";
  message: string;
  step?: SectionKey;
};

/** Validates the whole intake server-side, freezes it and queues generation. */
export async function submitIntake(rawId: string): Promise<SubmitResult> {
  const viewer = await getViewer();
  const id = intakeId.safeParse(rawId);
  if (!id.success) return { ok: false, code: "not_found", message: "We couldn't find this plan." };

  let requestId: string;
  try {
    const repo = await getIntakeRepository();
    const draft = await repo.get(viewer.user.id, id.data);
    if (!draft) return { ok: false, code: "not_found", message: "We couldn't find this plan." };
    if (draft.status === "submitted" && draft.requestId) {
      requestId = draft.requestId;
    } else {
      const missing = firstIncompleteSection(draft);
      if (missing) {
        const first = Object.values(completionIssues(missing, draft[missing]))[0];
        return { ok: false, code: "incomplete", step: missing, message: first ?? "Something still needs an answer." };
      }
      const limited = rateLimited(await generationUsage(viewer.user.id));
      if (limited) return { ok: false, code: "limit", message: limited.message };

      // Reserve what pays for this routine *before* freezing the intake.
      const billing = await getBillingStore();
      const reservation = await reserveInitialGeneration(billing, viewer.user.id);
      if (!reservation.ok) return { ok: false, code: "payment_required", message: reservation.message };

      const snapshot = buildSnapshot(draft, { timezone: viewer.profile.timezone, submittedAt: new Date() });
      try {
        requestId = await repo.submit(viewer.user.id, id.data, snapshot);
      } catch (error) {
        if (reservation.grantId) await billing.releaseCredit(reservation.grantId);
        throw error;
      }
      if (reservation.grantId) {
        // Submission is idempotent: if a concurrent submit already paid for this request, give ours back.
        const existing = await billing.creditForRequest(requestId);
        if (existing && existing.id !== reservation.grantId) await billing.releaseCredit(reservation.grantId);
        else await billing.consumeCredit(reservation.grantId, requestId);
      }
      track("intake_completed", viewer.user.id);
    }
  } catch (error) {
    const f = failure(error);
    return { ok: false, code: f.code === "invalid" ? "error" : f.code, message: f.message };
  }

  // Start building right away; the generating screen follows progress and can
  // re-trigger the run if this background task never gets going.
  const queued = requestId;
  after(async () => {
    await runGenerationRequest(queued);
  });

  revalidatePath(routes.plans);
  revalidatePath(routes.appHome);
  redirect(`${routes.plans}/generating/${requestId}`);
}

export async function discardIntake(rawId: string) {
  const uid = await userId();
  if (!uid) redirect(routes.login);
  const id = intakeId.safeParse(rawId);
  if (id.success) {
    const repo = await getIntakeRepository();
    await repo.archive(uid, id.data);
  }
  revalidatePath(routes.plans);
  revalidatePath(routes.appHome);
  redirect(routes.plans);
}

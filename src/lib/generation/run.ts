import "server-only";

import { techniqueInfo } from "@/content/intake";
import { getRoutineGenerator } from "@/lib/ai";
import { getPrivilegedBillingStore } from "@/lib/billing";
import { workerEntitled } from "@/lib/entitlements";
import { getGeminiEnv, getSupabaseSecretKey, isDemoMode } from "@/lib/env";
import { GenerationError, type RoutineGenerator } from "@/lib/ai/generator";
import type { AdjustmentRequest } from "@/lib/ai/prompt";
import { dailyMinutesRange, type PlanDoc } from "@/lib/plan/schema";
import { getWorkerStore } from "@/lib/plan";
import { PlanConflictError, PlanNotFoundError, type ClaimedRequest, type RegenerateSessionParams, type WorkerStore } from "@/lib/plan/store";

import { produceAdjustedPlan, produceInitialPlan, produceRegeneratedSession, type PipelineResult } from "./pipeline";
import { logError, logWarn, redact } from "@/lib/log";
import { track } from "@/lib/analytics/server";

/**
 * Runs one generation request end to end:
 * claim → generate (with repair) → persist atomically → complete | fail.
 *
 * Safe to call more than once for the same request (only one caller can
 * claim it), and safe to re-run after a crash (stale claims are reclaimed).
 */

const TOTAL_BUDGET_MS = 240_000;
/** Mirrors the attempts cap in claim_generation_request / retry_generation_request. */
const MAX_ATTEMPTS = 6;

async function releaseCreditFor(requestId: string) {
  try {
    const billing = getPrivilegedBillingStore();
    const credit = await billing.creditForRequest(requestId);
    if (credit) await billing.releaseCredit(credit.id);
  } catch (error) {
    logError("generation:release-credit", error, { requestId });
  }
}

export type RunOutcome = { status: "completed"; planId: string } | { status: "failed"; code: string } | { status: "skipped" };

const kindLabel: Record<AdjustmentRequest["kinds"][number], string> = {
  lighter: "Made it lighter",
  more_structured: "More structure",
  less_morning: "Less in the morning",
  less_evening: "Less in the evening",
  more_affirmations: "More affirmations",
  fewer_affirmations: "Fewer affirmations",
  remove_technique: "Removed techniques",
  schedule_changed: "Schedule changed",
  custom: "Custom change",
};

function summarise(req: ClaimedRequest, doc: PlanDoc, before?: PlanDoc) {
  if (req.kind === "initial") return "Your first routine";
  if (req.kind === "regenerate_session") {
    const { sessionId } = req.params as RegenerateSessionParams;
    const old = before?.sessions.find((s) => s.id === sessionId);
    const now = doc.sessions.find((s) => s.id === sessionId);
    return old && now ? `Regenerated “${old.title}” → ${now.title}` : "Regenerated a session";
  }
  const a = req.params as AdjustmentRequest;
  const parts = a.kinds.map((k) =>
    k === "remove_technique" && a.removeTechniques.length
      ? `Removed ${a.removeTechniques.map((t) => techniqueInfo[t].label).join(", ")}`
      : kindLabel[k],
  );
  return parts.join(" · ") || "Adjusted";
}

async function produce(req: ClaimedRequest, generator: RoutineGenerator, worker: WorkerStore, signal: AbortSignal) {
  if (req.kind === "initial") {
    const res = await produceInitialPlan(generator, req.snapshot, { manifestationId: req.manifestationId, signal });
    return { res, base: null as null | { doc: PlanDoc; version: number } };
  }
  const base = req.planId ? await worker.loadPlan(req.planId) : null;
  if (!base) throw new GenerationError("not_found", "Plan not found", false);

  let res: PipelineResult;
  if (req.kind === "adjust") {
    res = await produceAdjustedPlan(generator, req.snapshot, base.doc, req.params as AdjustmentRequest, { signal });
  } else {
    const p = req.params as RegenerateSessionParams;
    res = await produceRegeneratedSession(generator, req.snapshot, base.doc, p.sessionId, p.note ?? "", { signal });
  }
  return { res, base };
}

export async function runGenerationRequest(
  requestId: string,
  deps: {
    worker?: WorkerStore;
    generator?: RoutineGenerator;
    entitled?: (req: ClaimedRequest) => Promise<boolean>;
    releaseCredit?: (requestId: string) => Promise<void>;
  } = {},
): Promise<RunOutcome> {
  let worker: WorkerStore;
  try {
    worker = deps.worker ?? getWorkerStore();
  } catch (error) {
    logError("generation:worker", error);
    return { status: "skipped" };
  }

  const claimed = await worker.claim(requestId);
  if (!claimed) return { status: "skipped" };

  const signal = AbortSignal.timeout(TOTAL_BUDGET_MS);
  if (claimed.attempts === 1) track("generation_started", claimed.userId, { kind: claimed.kind });
  try {
    const entitled = deps.entitled ?? ((req: ClaimedRequest) => workerEntitled(getPrivilegedBillingStore(), req));
    if (!(await entitled(claimed))) {
      throw new GenerationError("not_entitled", "Not entitled to generate", false);
    }
    const generator = deps.generator ?? getRoutineGenerator();

    // One automatic retry if the user edited the plan while we were working.
    for (let attempt = 0; attempt < 2; attempt++) {
      const { res, base } = await produce(claimed, generator, worker, signal);
      if (res.autoFixed.length) {
        logWarn("generation", `auto-fixed ${res.autoFixed.length} problem(s)`, { requestId, codes: res.autoFixed.map((p) => p.code).join(",") });
      }
      try {
        const saved = await worker.complete(requestId, {
          doc: res.doc,
          title: res.doc.title,
          dailyMinutes: (() => {
            const { max } = dailyMinutesRange(res.doc);
            return max > 0 ? Math.min(600, max) : null;
          })(),
          structure: claimed.snapshot.intensity.style,
          model: generator.model,
          summary: summarise(claimed, res.doc, base?.doc),
          baseVersion: base?.version ?? null,
        });
        track("generation_succeeded", claimed.userId, { kind: claimed.kind, attempts: res.attempts });
        return { status: "completed", planId: saved.planId };
      } catch (error) {
        if (error instanceof PlanConflictError && attempt === 0) continue;
        throw error;
      }
    }
    throw new GenerationError("conflict", "Plan kept changing during generation", true);
  } catch (error) {
    const g =
      error instanceof GenerationError
        ? error
        : error instanceof PlanConflictError
          ? new GenerationError("conflict", error.message, true)
          : error instanceof PlanNotFoundError
            ? new GenerationError("not_found", error.message, false)
            : new GenerationError("internal", error instanceof Error ? error.message : String(error), true);
    track("generation_failed", claimed.userId, { kind: claimed.kind, code: g.code });
    // Messages can quote session titles or activity names — store and log them redacted.
    logError("generation", g, { requestId, code: g.code, retryable: g.retryable });
    // A routine that can never be built gives its credit back.
    if (claimed.kind === "initial" && (!g.retryable || claimed.attempts >= MAX_ATTEMPTS) && g.code !== "not_entitled") {
      await (deps.releaseCredit ?? releaseCreditFor)(requestId);
    }
    try {
      await worker.fail(requestId, g.code, redact(g.message), g.retryable);
    } catch (failError) {
      // If even this fails, the stale-claim window lets a later run recover.
      logError("generation:fail", failError, { requestId });
    }
    return { status: "failed", code: g.code };
  }
}

/**
 * Whether this environment can generate at all. Lets the UI explain a
 * configuration problem instead of waiting on a request nobody can run.
 */
export function generationReadiness(): { ready: true } | { ready: false; code: "not_configured"; detail: string } {
  if (isDemoMode()) return { ready: true };
  if (!getGeminiEnv()) return { ready: false, code: "not_configured", detail: "GEMINI_API_KEY is not set" };
  if (!getSupabaseSecretKey()) return { ready: false, code: "not_configured", detail: "SUPABASE_SECRET_KEY is not set" };
  return { ready: true };
}

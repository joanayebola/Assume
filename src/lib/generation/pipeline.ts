import { careThemes, ensureCareNote } from "@/lib/ai/safety";
import { z } from "zod";

import { GenerationError, type RoutineGenerator } from "@/lib/ai/generator";
import type { AdjustmentRequest } from "@/lib/ai/prompt";
import { aiPlanSchema, aiSessionSchema } from "@/lib/ai/schema";
import type { IntakeSnapshotV2 } from "@/lib/intake/snapshot";
import { planDocFromAI, replaceSessionFromAI } from "@/lib/plan/build";
import { applyFixes, blockingProblems, checkPlan, type Problem } from "@/lib/plan/checks";
import { planDocSchema, type PlanDoc } from "@/lib/plan/schema";

/**
 * validated intake → model → strict schema → app document → sanity checks
 * → (one repair attempt with the problems fed back) → last-resort fixes.
 *
 * Pure orchestration over an injected RoutineGenerator, so it is fully
 * testable offline.
 */

export type PipelineResult = {
  doc: PlanDoc;
  attempts: number;
  /** Problems fixed automatically on the final attempt (logged, not shown). */
  autoFixed: Problem[];
};

const MAX_ATTEMPTS = 2;

function summariseZod(error: z.ZodError) {
  return error.issues
    .slice(0, 8)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new GenerationError("invalid_output", `Output didn't match the schema — ${summariseZod(parsed.error)}`, true);
  }
  return parsed.data;
}

function finalDoc(doc: PlanDoc): PlanDoc {
  const parsed = planDocSchema.safeParse(doc);
  if (!parsed.success) {
    throw new GenerationError("invalid_output", `Plan document invalid — ${summariseZod(parsed.error)}`, true);
  }
  return parsed.data;
}

async function withRepair(
  attempt: (feedback?: string[]) => Promise<PlanDoc>,
  check: (doc: PlanDoc) => Problem[],
  protectedIds: Set<string> = new Set(),
): Promise<PipelineResult> {
  let feedback: string[] | undefined;
  let last: { doc: PlanDoc; problems: Problem[] } | null = null;

  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    let doc: PlanDoc;
    try {
      doc = finalDoc(await attempt(feedback));
    } catch (error) {
      // A malformed answer gets one more try with the reason attached.
      if (error instanceof GenerationError && error.code === "invalid_output" && i < MAX_ATTEMPTS) {
        feedback = [`Your previous answer was invalid: ${error.message}. Return JSON that matches the schema exactly.`];
        continue;
      }
      throw error;
    }
    const problems = check(doc);
    if (problems.length === 0) return { doc, attempts: i, autoFixed: [] };
    last = { doc, problems };
    feedback = problems.slice(0, 15).map((p) => p.message);
  }

  if (!last) throw new GenerationError("invalid_output", "No usable plan was produced", true);

  // Last resort: apply safe automatic fixes, then re-check.
  const fixed = finalDoc(applyFixes(last.doc, last.problems, protectedIds));
  const remaining = check(fixed);
  const blocking = [...blockingProblems(remaining), ...remaining.filter((p) => p.fix.kind !== "none" && p.code !== "style_light" && p.code !== "style_hourly")];
  if (fixed.sessions.length === 0 || blocking.length > 0) {
    throw new GenerationError(
      "quality_check_failed",
      `Plan failed checks after ${MAX_ATTEMPTS} attempts: ${(blocking[0] ?? remaining[0])?.message ?? "no sessions left"}`,
      true,
    );
  }
  return { doc: fixed, attempts: MAX_ATTEMPTS, autoFixed: last.problems };
}

/** Serious circumstances: make sure the plan points gently at real-world help. */
function withCare(result: PipelineResult, snapshot: IntakeSnapshotV2): PipelineResult {
  return { ...result, doc: ensureCareNote(result.doc, careThemes(snapshot)) };
}

export async function produceInitialPlan(
  generator: RoutineGenerator,
  snapshot: IntakeSnapshotV2,
  opts: { manifestationId: string | null; signal?: AbortSignal },
): Promise<PipelineResult> {
  const result = await withRepair(
    async (feedback) => {
      const raw = await generator.createPlan({ snapshot, feedback, signal: opts.signal });
      return planDocFromAI(parse(aiPlanSchema, raw), { snapshot, manifestationId: opts.manifestationId });
    },
    (doc) => checkPlan(doc, snapshot),
  );
  return withCare(result, snapshot);
}

export async function produceAdjustedPlan(
  generator: RoutineGenerator,
  snapshot: IntakeSnapshotV2,
  current: PlanDoc,
  adjustment: AdjustmentRequest,
  opts: { signal?: AbortSignal } = {},
): Promise<PipelineResult> {
  // User-edited sessions stay exactly as they are unless the user opts in,
  // except when they explicitly asked to remove that technique everywhere.
  const pinned = adjustment.keepEditedSessions
    ? current.sessions.filter(
        (s) => s.userEdited && !(adjustment.kinds.includes("remove_technique") && adjustment.removeTechniques.includes(s.technique)),
      )
    : [];
  const protectedIds = new Set(pinned.map((p) => p.id));

  // "Remove X" is a hard constraint for this adjustment.
  const effective: IntakeSnapshotV2 = adjustment.kinds.includes("remove_technique")
    ? { ...snapshot, techniques: { ...snapshot.techniques, avoid: [...new Set([...snapshot.techniques.avoid, ...adjustment.removeTechniques])] } }
    : snapshot;

  const result = await withRepair(
    async (feedback) => {
      const raw = await generator.adjustPlan({ snapshot: effective, current, pinned, adjustment, feedback, signal: opts.signal });
      return planDocFromAI(parse(aiPlanSchema, raw), {
        snapshot: effective,
        manifestationId: current.manifestation.id,
        base: current,
        pinned,
      });
    },
    // Problems caused only by the user's own fixed sessions aren't the model's to fix.
    (doc) =>
      checkPlan(doc, effective, { protectedIds }).filter((p) => {
        if (p.sessionId && protectedIds.has(p.sessionId)) return false;
        if (p.fix.kind === "trim_day") {
          const day = p.fix.day;
          const pinnedMinutes = pinned.filter((x) => !x.optional && x.days.includes(day)).reduce((n, x) => n + x.durationMinutes, 0);
          if (pinnedMinutes >= p.fix.maxMinutes) return false;
        }
        return true;
      }),
    protectedIds,
  );
  return withCare(result, snapshot);
}

export async function produceRegeneratedSession(
  generator: RoutineGenerator,
  snapshot: IntakeSnapshotV2,
  current: PlanDoc,
  sessionId: string,
  note: string,
  opts: { signal?: AbortSignal } = {},
): Promise<PipelineResult> {
  const target = current.sessions.find((s) => s.id === sessionId);
  if (!target) throw new GenerationError("not_found", "That session no longer exists", false);
  const others = new Set(current.sessions.filter((s) => s.id !== sessionId).map((s) => s.id));

  const result = await withRepair(
    async (feedback) => {
      const raw = await generator.regenerateSession({ snapshot, current, session: target, note, feedback, signal: opts.signal });
      return replaceSessionFromAI(current, sessionId, parse(aiSessionSchema, raw));
    },
    // Judge only the new session (and the days it touches), not the rest of the plan.
    (doc) =>
      checkPlan(doc, snapshot, { protectedIds: others }).filter(
        (p) => p.sessionId === sessionId || (p.code === "over_budget" && p.fix.kind === "trim_day" && target.days.includes(p.fix.day)),
      ),
    others,
  );
  // A last-resort fix must never silently delete the session being regenerated.
  if (!result.doc.sessions.some((s) => s.id === sessionId)) {
    throw new GenerationError("quality_check_failed", "The replacement session didn't fit the schedule", true);
  }
  return result;
}

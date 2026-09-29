import type { IntakeSnapshotV2 } from "@/lib/intake/snapshot";
import type { PlanDoc, Session } from "@/lib/plan/schema";

import type { AdjustmentRequest } from "./prompt";

/**
 * The AI boundary. Implementations return *unvalidated* JSON-ish values;
 * callers always parse them with the Zod schemas in ./schema before use.
 *
 * `feedback` carries problems from a previous attempt (repair loop).
 */
export interface RoutineGenerator {
  /** Recorded on plans/versions as generation_model. */
  readonly model: string;
  createPlan(input: { snapshot: IntakeSnapshotV2; feedback?: string[]; signal?: AbortSignal }): Promise<unknown>;
  adjustPlan(input: {
    snapshot: IntakeSnapshotV2;
    current: PlanDoc;
    pinned: Session[];
    adjustment: AdjustmentRequest;
    feedback?: string[];
    signal?: AbortSignal;
  }): Promise<unknown>;
  regenerateSession(input: {
    snapshot: IntakeSnapshotV2;
    current: PlanDoc;
    session: Session;
    note: string;
    feedback?: string[];
    signal?: AbortSignal;
  }): Promise<unknown>;
}

export type GenerationErrorCode =
  | "not_configured"
  | "timeout"
  | "rate_limited"
  | "api_error"
  | "blocked"
  | "invalid_output"
  | "quality_check_failed"
  | "not_entitled"
  | "conflict"
  | "not_found"
  | "internal";

export class GenerationError extends Error {
  constructor(
    readonly code: GenerationErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

/** User-facing copy per failure — honest, short, no blame. */
export const generationErrorCopy: Record<GenerationErrorCode, string> = {
  not_configured: "Routine building isn't switched on for this environment yet.",
  timeout: "Building your routine took longer than expected.",
  rate_limited: "Lots of routines are being built right now.",
  api_error: "Our routine builder had a hiccup.",
  blocked: "The routine builder couldn't work with part of what you shared.",
  invalid_output: "The routine came back incomplete.",
  quality_check_failed: "The routine didn't meet our standards for your schedule.",
  not_entitled: "Building a new routine needs a purchase first. Your answers are saved and you haven't been charged.",
  conflict: "Your routine changed while we were working on it.",
  not_found: "We couldn't find what we were building.",
  internal: "Something went wrong on our side.",
};

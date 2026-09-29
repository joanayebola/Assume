import "server-only";

import type {
  GenerationRequestSummary,
  IntakeDraft,
  IntakeSections,
  IntakeSummary,
  SectionKey,
  StepKey,
} from "./model";
import type { IntakeSnapshotV2 } from "./snapshot";

export type Progress = { currentStep: StepKey; completedSteps: StepKey[] };

/**
 * Persistence for the plan intake. Two implementations share this contract:
 *  - SupabaseIntakeRepository (production; RLS-enforced ownership)
 *  - DemoIntakeRepository (local file store, demo mode only)
 *
 * All methods are scoped to `userId`; implementations must never return or
 * modify another user's data.
 */
export interface IntakeRepository {
  listInProgress(userId: string): Promise<IntakeSummary[]>;
  create(userId: string): Promise<string>;
  get(userId: string, intakeId: string): Promise<IntakeDraft | null>;
  saveSection<K extends SectionKey>(
    userId: string,
    intakeId: string,
    key: K,
    data: IntakeSections[K],
  ): Promise<void>;
  saveProgress(userId: string, intakeId: string, progress: Progress): Promise<void>;
  submit(userId: string, intakeId: string, snapshot: IntakeSnapshotV2): Promise<string>;
  archive(userId: string, intakeId: string): Promise<void>;
  getRequest(userId: string, requestId: string): Promise<GenerationRequestSummary | null>;
  listRequests(userId: string): Promise<GenerationRequestSummary[]>;
}

export class IntakeNotFoundError extends Error {
  constructor() {
    super("Intake not found");
    this.name = "IntakeNotFoundError";
  }
}

export class IntakeLockedError extends Error {
  constructor() {
    super("This plan has already been submitted");
    this.name = "IntakeLockedError";
  }
}

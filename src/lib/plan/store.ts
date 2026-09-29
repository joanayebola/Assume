import type { AdjustmentRequest } from "@/lib/ai/prompt";
import type { GenerationStatus } from "@/lib/intake/model";
import type { IntakeSnapshotV2 } from "@/lib/intake/snapshot";
import type { Enums } from "@/types/database";

import type { PlanDoc } from "./schema";

/**
 * Persistence contracts for plans and generation.
 *
 * `PlanStore` is user-scoped (RLS applies in Supabase). `WorkerStore` is the
 * privileged side used only by the generation runner — it can claim, complete
 * and fail requests, which users can never do directly.
 */

export type GenerationKind = Enums<"generation_kind">;
export type VersionSource = Enums<"plan_version_source">;

export type RegenerateSessionParams = { sessionId: string; note: string };
export type RequestParams = AdjustmentRequest | RegenerateSessionParams | Record<string, never>;

export type PlanSummary = {
  id: string;
  title: string;
  status: Enums<"plan_status">;
  daily_minutes: number | null;
  updated_at: string;
};

export type PlanStatus = Enums<"plan_status">;
export type LifecycleStatus = Extract<PlanStatus, "active" | "paused" | "completed" | "archived">;

export type PlanRecord = {
  id: string;
  title: string;
  doc: PlanDoc;
  version: number;
  status: PlanStatus;
  structure: Enums<"routine_style">;
  intakeId: string | null;
  manifestationId: string | null;
  generationModel: string | null;
  updatedAt: string;
  createdAt: string;
  pausedAt: string | null;
  completedAt: string | null;
};

export type ManifestedEntry = {
  id: string;
  planId: string | null;
  title: string;
  desire: string;
  note: string | null;
  manifestedOn: string;
  createdAt: string;
};

export type VersionSummary = {
  version: number;
  source: VersionSource;
  summary: string | null;
  model: string | null;
  createdAt: string;
};

export type RequestStatus = {
  id: string;
  kind: GenerationKind;
  status: GenerationStatus;
  planId: string | null;
  intakeId: string;
  title: string;
  errorCode: string | null;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  params: RequestParams;
};

export interface PlanStore {
  listPlans(userId: string): Promise<PlanSummary[]>;
  /** Every plan with its routine (all statuses), newest first — for Today and My Plans. */
  listPlanRecords(userId: string): Promise<PlanRecord[]>;
  getPlan(userId: string, planId: string): Promise<PlanRecord | null>;
  setStatus(userId: string, planId: string, status: LifecycleStatus): Promise<void>;
  duplicatePlan(userId: string, planId: string): Promise<string>;
  deletePlan(userId: string, planId: string): Promise<void>;
  listManifested(userId: string): Promise<ManifestedEntry[]>;
  addManifested(userId: string, entry: Omit<ManifestedEntry, "id" | "createdAt">): Promise<ManifestedEntry>;
  deleteManifested(userId: string, id: string): Promise<void>;
  listVersions(userId: string, planId: string): Promise<VersionSummary[]>;
  saveEdit(userId: string, planId: string, doc: PlanDoc, summary: string, expectedVersion: number): Promise<number>;
  restoreVersion(userId: string, planId: string, version: number): Promise<number>;
  requestChange(userId: string, planId: string, kind: Exclude<GenerationKind, "initial">, params: RequestParams): Promise<string>;
  retry(userId: string, requestId: string): Promise<void>;
  getRequest(userId: string, requestId: string): Promise<RequestStatus | null>;
  /** Latest request for a plan's intake that is still live or failed (for inline status). */
  latestRequestForPlan(userId: string, planId: string): Promise<RequestStatus | null>;
  countRequestsSince(userId: string, since: Date): Promise<number>;
}

export type ClaimedRequest = {
  id: string;
  userId: string;
  kind: GenerationKind;
  params: RequestParams;
  snapshot: IntakeSnapshotV2;
  planId: string | null;
  manifestationId: string;
  attempts: number;
};

export type CompletedResult = {
  doc: PlanDoc;
  title: string;
  dailyMinutes: number | null;
  structure: Enums<"routine_style">;
  model: string;
  summary: string;
  /** Plan version the result was built on (null for initial plans). */
  baseVersion: number | null;
};

export interface WorkerStore {
  claim(requestId: string): Promise<ClaimedRequest | null>;
  loadPlan(planId: string): Promise<{ doc: PlanDoc; version: number } | null>;
  complete(requestId: string, result: CompletedResult): Promise<{ planId: string; version: number }>;
  fail(requestId: string, code: string, message: string, retryable: boolean): Promise<void>;
}

export class PlanConflictError extends Error {
  constructor() {
    super("The plan changed since it was loaded");
    this.name = "PlanConflictError";
  }
}

export class PlanNotFoundError extends Error {
  constructor() {
    super("Plan not found");
    this.name = "PlanNotFoundError";
  }
}

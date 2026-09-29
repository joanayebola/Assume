import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json, Tables } from "@/types/database";

import { dailyMinutesRange, planDocSchema, type PlanDoc } from "./schema";
import {
  PlanConflictError,
  PlanNotFoundError,
  type ClaimedRequest,
  type CompletedResult,
  type LifecycleStatus,
  type ManifestedEntry,
  type PlanRecord,
  type PlanStore,
  type RequestParams,
  type RequestStatus,
  type WorkerStore,
} from "./store";
import type { IntakeSnapshotV2 } from "@/lib/intake/snapshot";

type Client = SupabaseClient<Database>;

function fail(context: string, error: { message: string; code?: string } | null): never {
  if (error?.code === "P0409") throw new PlanConflictError();
  if (error?.code === "P0002") throw new PlanNotFoundError();
  throw new Error(`[plans:${context}] ${error?.message ?? "unknown error"}`);
}

function parseDoc(raw: unknown): PlanDoc | null {
  const parsed = planDocSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const dailyMinutesFor = (doc: PlanDoc) => {
  const { max } = dailyMinutesRange(doc);
  return max > 0 ? Math.min(600, max) : null;
};

function toRecord(row: Tables<"plans">): PlanRecord | null {
  const doc = parseDoc(row.routine);
  if (!doc) return null;
  return {
    id: row.id,
    title: row.title,
    doc,
    version: row.current_version,
    status: row.status,
    structure: row.structure,
    intakeId: row.intake_id,
    manifestationId: row.manifestation_id,
    generationModel: row.generation_model,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    pausedAt: row.paused_at,
    completedAt: row.completed_at,
  };
}

const toManifested = (m: Tables<"manifested_entries">): ManifestedEntry => ({
  id: m.id,
  planId: m.plan_id,
  title: m.title,
  desire: m.desire,
  note: m.note,
  manifestedOn: m.manifested_on,
  createdAt: m.created_at,
});

function toStatus(r: Tables<"plan_generation_requests">, title: string): RequestStatus {
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    planId: r.plan_id,
    intakeId: r.intake_id,
    title,
    errorCode: r.error_code,
    attempts: r.attempts,
    createdAt: r.created_at,
    startedAt: r.started_at,
    params: (r.params ?? {}) as RequestParams,
  };
}

/** User-scoped plan persistence. Every query runs under the user's RLS. */
export class SupabasePlanStore implements PlanStore {
  constructor(private readonly db: Client) {}

  async listPlans(userId: string) {
    const { data, error } = await this.db
      .from("plans")
      .select("id, title, status, daily_minutes, updated_at")
      .eq("user_id", userId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false });
    if (error) fail("list", error);
    return data;
  }

  async listPlanRecords(userId: string) {
    const { data, error } = await this.db.from("plans").select("*").eq("user_id", userId).order("updated_at", { ascending: false });
    if (error) fail("records", error);
    return data.map(toRecord).filter((p): p is PlanRecord => p !== null);
  }

  async getPlan(userId: string, planId: string): Promise<PlanRecord | null> {
    const { data, error } = await this.db.from("plans").select("*").eq("id", planId).eq("user_id", userId).maybeSingle();
    if (error) fail("get", error);
    return data ? toRecord(data) : null;
  }

  async setStatus(_userId: string, planId: string, status: LifecycleStatus) {
    const { error } = await this.db.rpc("set_plan_status", { p_plan_id: planId, p_status: status });
    if (error) fail("status", error);
  }

  async duplicatePlan(_userId: string, planId: string) {
    const { data, error } = await this.db.rpc("duplicate_plan", { p_plan_id: planId });
    if (error) fail("duplicate", error);
    return data;
  }

  async deletePlan(_userId: string, planId: string) {
    const { error } = await this.db.rpc("delete_plan", { p_plan_id: planId });
    if (error) fail("delete", error);
  }

  async listManifested(userId: string) {
    const { data, error } = await this.db
      .from("manifested_entries")
      .select("*")
      .eq("user_id", userId)
      .order("manifested_on", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) fail("manifested:list", error);
    return data.map(toManifested);
  }

  async addManifested(userId: string, entry: Omit<ManifestedEntry, "id" | "createdAt">) {
    const row = {
      user_id: userId,
      plan_id: entry.planId,
      title: entry.title.slice(0, 160),
      desire: entry.desire.slice(0, 1000),
      note: entry.note,
      manifested_on: entry.manifestedOn,
    };
    // One archive entry per plan: saving again updates it.
    const existing = entry.planId
      ? (await this.db.from("manifested_entries").select("id").eq("user_id", userId).eq("plan_id", entry.planId).maybeSingle()).data
      : null;
    const query = existing
      ? this.db.from("manifested_entries").update(row).eq("id", existing.id)
      : this.db.from("manifested_entries").insert(row);
    const { data, error } = await query.select("*").single();
    if (error) fail("manifested:add", error);
    return toManifested(data);
  }

  async deleteManifested(userId: string, id: string) {
    const { error } = await this.db.from("manifested_entries").delete().eq("user_id", userId).eq("id", id);
    if (error) fail("manifested:delete", error);
  }

  async listVersions(userId: string, planId: string) {
    const { data, error } = await this.db
      .from("plan_versions")
      .select("version, source, summary, model, created_at")
      .eq("plan_id", planId)
      .eq("user_id", userId)
      .order("version", { ascending: false })
      .limit(30);
    if (error) fail("versions", error);
    return data.map((v) => ({ version: v.version, source: v.source, summary: v.summary, model: v.model, createdAt: v.created_at }));
  }

  async saveEdit(_userId: string, planId: string, doc: PlanDoc, summary: string, expectedVersion: number) {
    const { data, error } = await this.db.rpc("save_plan_edit", {
      p_plan_id: planId,
      p_document: doc as unknown as Json,
      p_title: doc.title,
      p_daily_minutes: dailyMinutesFor(doc),
      p_summary: summary.slice(0, 300),
      p_expected_version: expectedVersion,
    });
    if (error) fail("edit", error);
    return data;
  }

  async restoreVersion(_userId: string, planId: string, version: number) {
    const { data, error } = await this.db.rpc("restore_plan_version", { p_plan_id: planId, p_version: version });
    if (error) fail("restore", error);
    return data;
  }

  async requestChange(_userId: string, planId: string, kind: "adjust" | "regenerate_session", params: RequestParams) {
    const { data, error } = await this.db.rpc("request_plan_change", {
      p_plan_id: planId,
      p_kind: kind,
      p_params: params as unknown as Json,
    });
    if (error) fail("request", error);
    return data;
  }

  async retry(_userId: string, requestId: string) {
    const { error } = await this.db.rpc("retry_generation_request", { p_request_id: requestId });
    if (error) fail("retry", error);
  }

  private async titleFor(manifestationId: string) {
    const { data } = await this.db.from("manifestations").select("title").eq("id", manifestationId).maybeSingle();
    return data?.title ?? "Your manifestation";
  }

  async getRequest(userId: string, requestId: string) {
    const { data, error } = await this.db
      .from("plan_generation_requests")
      .select("*")
      .eq("id", requestId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) fail("request:get", error);
    if (!data) return null;
    return toStatus(data, await this.titleFor(data.manifestation_id));
  }

  async latestRequestForPlan(userId: string, planId: string) {
    const { data, error } = await this.db
      .from("plan_generation_requests")
      .select("*")
      .eq("user_id", userId)
      .eq("plan_id", planId)
      .neq("kind", "initial")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) fail("request:latest", error);
    if (!data || data.status === "completed" || data.status === "cancelled") return null;
    return toStatus(data, await this.titleFor(data.manifestation_id));
  }

  async countRequestsSince(userId: string, since: Date) {
    const { count, error } = await this.db
      .from("plan_generation_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since.toISOString());
    if (error) fail("count", error);
    return count ?? 0;
  }
}

/** Privileged worker persistence (service role, narrow SQL functions only). */
export class SupabaseWorkerStore implements WorkerStore {
  constructor(private readonly admin: Client) {}

  async claim(requestId: string): Promise<ClaimedRequest | null> {
    const { data, error } = await this.admin.rpc("claim_generation_request", { p_request_id: requestId });
    if (error) fail("claim", error);
    const row = data?.[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      kind: row.kind,
      params: (row.params ?? {}) as RequestParams,
      snapshot: row.input_snapshot as unknown as IntakeSnapshotV2,
      planId: row.plan_id,
      manifestationId: row.manifestation_id,
      attempts: row.attempts,
    };
  }

  async loadPlan(planId: string) {
    const { data, error } = await this.admin.from("plans").select("routine, current_version").eq("id", planId).maybeSingle();
    if (error) fail("worker:load", error);
    const doc = data ? parseDoc(data.routine) : null;
    return doc && data ? { doc, version: data.current_version } : null;
  }

  async complete(requestId: string, r: CompletedResult) {
    const { data, error } = await this.admin.rpc("complete_generation_request", {
      p_request_id: requestId,
      p_document: r.doc as unknown as Json,
      p_title: r.title,
      p_daily_minutes: r.dailyMinutes,
      p_structure: r.structure,
      p_model: r.model,
      p_summary: r.summary.slice(0, 300),
      p_base_version: r.baseVersion,
    });
    if (error) fail("complete", error);
    const row = data?.[0];
    if (!row) throw new Error("[plans:complete] no result row");
    return { planId: row.plan_id, version: row.version };
  }

  async fail(requestId: string, code: string, message: string, retryable: boolean) {
    const { error } = await this.admin.rpc("fail_generation_request", {
      p_request_id: requestId,
      p_code: code,
      p_message: message,
      p_retryable: retryable,
    });
    if (error) fail("fail", error);
  }
}

export { dailyMinutesFor };

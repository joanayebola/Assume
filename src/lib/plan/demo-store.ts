import "server-only";

import { randomUUID } from "node:crypto";

import { loadDemo, mutateDemo, withoutUser, type DemoPlan, type DemoRequest } from "@/lib/demo/store";

import { dailyMinutesRange, type PlanDoc } from "./schema";
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

/**
 * Demo-mode plan persistence. Mirrors the SQL functions' semantics
 * (idempotent requests, claim/stale reclaim, optimistic concurrency,
 * coalesced user edits, non-destructive restore) against the demo file.
 */

const STALE_MS = 4 * 60_000;
const MAX_ATTEMPTS = 6;
const COALESCE_MS = 10 * 60_000;

const toStatus = (r: DemoRequest): RequestStatus => ({
  id: r.id,
  kind: r.kind,
  status: r.status,
  planId: r.planId,
  intakeId: r.intakeId,
  title: r.title,
  errorCode: r.errorCode,
  attempts: r.attempts,
  createdAt: r.createdAt,
  startedAt: r.startedAt,
  params: r.params,
});

const toRecord = (p: DemoPlan): PlanRecord => ({
  id: p.id,
  title: p.title,
  doc: p.doc,
  version: p.version,
  status: p.status,
  structure: p.structure,
  intakeId: p.intakeId,
  manifestationId: p.manifestationId,
  generationModel: p.generationModel,
  updatedAt: p.updatedAt,
  createdAt: p.createdAt ?? p.updatedAt,
  pausedAt: p.pausedAt ?? null,
  completedAt: p.completedAt ?? null,
});

const minutes = (doc: PlanDoc) => {
  const { max } = dailyMinutesRange(doc);
  return max > 0 ? Math.min(600, max) : null;
};

export class DemoPlanStore implements PlanStore, WorkerStore {
  // ---- user-scoped -----------------------------------------------------------

  async listPlans(userId: string) {
    const store = await loadDemo();
    return Object.values(store.plans)
      .filter((p) => p.userId === userId && p.status !== "archived")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((p) => ({ id: p.id, title: p.title, status: p.status, daily_minutes: p.dailyMinutes, updated_at: p.updatedAt }));
  }

  async listPlanRecords(userId: string) {
    return Object.values((await loadDemo()).plans)
      .filter((p) => p.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(toRecord);
  }

  async getPlan(userId: string, planId: string): Promise<PlanRecord | null> {
    const p = (await loadDemo()).plans[planId];
    if (!p || p.userId !== userId) return null;
    return toRecord(p);
  }

  setStatus(userId: string, planId: string, status: LifecycleStatus) {
    return mutateDemo((store) => {
      const plan = store.plans[planId];
      if (!plan || plan.userId !== userId) throw new PlanNotFoundError();
      const now = new Date().toISOString();
      plan.status = status;
      plan.pausedAt = status === "paused" ? now : status === "active" ? null : (plan.pausedAt ?? null);
      plan.completedAt = status === "completed" ? (plan.completedAt ?? now) : status === "active" ? null : (plan.completedAt ?? null);
      plan.archivedAt = status === "archived" ? now : null;
      plan.updatedAt = now;
    });
  }

  duplicatePlan(userId: string, planId: string) {
    return mutateDemo((store) => {
      const plan = store.plans[planId];
      if (!plan || plan.userId !== userId) throw new PlanNotFoundError();
      const id = randomUUID();
      const now = new Date().toISOString();
      const doc = { ...plan.doc, title: `${plan.doc.title} (copy)`.slice(0, 100) };
      store.plans[id] = {
        ...plan,
        id,
        title: `${plan.title} (copy)`.slice(0, 160),
        status: "active",
        doc,
        version: 1,
        updatedAt: now,
        createdAt: now,
        pausedAt: null,
        completedAt: null,
        archivedAt: null,
      };
      store.versions.push({
        planId: id,
        userId,
        version: 1,
        doc,
        source: "duplicated",
        summary: `Copied from “${plan.title}”`,
        model: plan.generationModel,
        requestId: null,
        createdAt: now,
      });
      return id;
    });
  }

  deletePlan(userId: string, planId: string) {
    return mutateDemo((store) => {
      const plan = store.plans[planId];
      if (!plan || plan.userId !== userId) throw new PlanNotFoundError();
      delete store.plans[planId];
      store.versions = store.versions.filter((v) => v.planId !== planId);
      for (const [id, r] of Object.entries(store.requests)) {
        if (r.planId !== planId) continue;
        if (r.kind === "initial") r.planId = null;
        else delete store.requests[id];
      }
      store.calendarExports = store.calendarExports.filter((e) => e.planId !== planId);
      store.eventLinks = store.eventLinks.filter((l) => l.planId !== planId);
      store.checkins = store.checkins.filter((c) => c.planId !== planId);
      for (const m of store.manifested) if (m.planId === planId) m.planId = null;
    });
  }

  async listManifested(userId: string) {
    return (await loadDemo()).manifested
      .filter((m) => m.userId === userId)
      .sort((a, b) => b.manifestedOn.localeCompare(a.manifestedOn) || b.createdAt.localeCompare(a.createdAt))
      .map(withoutUser);
  }

  addManifested(userId: string, entry: Omit<ManifestedEntry, "id" | "createdAt">) {
    return mutateDemo((store) => {
      const existing = entry.planId ? store.manifested.find((m) => m.userId === userId && m.planId === entry.planId) : undefined;
      const next = { ...entry, id: existing?.id ?? randomUUID(), userId, createdAt: existing?.createdAt ?? new Date().toISOString() };
      store.manifested = [...store.manifested.filter((m) => m !== existing), next];
      return withoutUser(next);
    });
  }

  async deleteManifested(userId: string, id: string) {
    await mutateDemo((store) => {
      store.manifested = store.manifested.filter((m) => !(m.userId === userId && m.id === id));
    });
  }

  async listVersions(userId: string, planId: string) {
    const store = await loadDemo();
    return store.versions
      .filter((v) => v.planId === planId && v.userId === userId)
      .sort((a, b) => b.version - a.version)
      .slice(0, 30)
      .map((v) => ({ version: v.version, source: v.source, summary: v.summary, model: v.model, createdAt: v.createdAt }));
  }

  saveEdit(userId: string, planId: string, doc: PlanDoc, summary: string, expectedVersion: number) {
    return mutateDemo((store) => {
      const plan = store.plans[planId];
      if (!plan || plan.userId !== userId) throw new PlanNotFoundError();
      if (plan.version !== expectedVersion) throw new PlanConflictError();
      const latest = store.versions.find((v) => v.planId === planId && v.version === plan.version);
      const now = new Date();
      if (latest && latest.source === "user_edit" && now.getTime() - Date.parse(latest.createdAt) < COALESCE_MS) {
        latest.doc = doc;
        latest.summary = summary;
      } else {
        plan.version += 1;
        store.versions.push({ planId, userId, version: plan.version, doc, source: "user_edit", summary, model: null, requestId: null, createdAt: now.toISOString() });
      }
      plan.doc = doc;
      plan.title = doc.title;
      plan.dailyMinutes = minutes(doc);
      plan.updatedAt = now.toISOString();
      return plan.version;
    });
  }

  restoreVersion(userId: string, planId: string, version: number) {
    return mutateDemo((store) => {
      const plan = store.plans[planId];
      const source = store.versions.find((v) => v.planId === planId && v.version === version);
      if (!plan || plan.userId !== userId || !source) throw new PlanNotFoundError();
      plan.version += 1;
      store.versions.push({
        planId,
        userId,
        version: plan.version,
        doc: source.doc,
        source: "restored",
        summary: `Restored version ${version}`,
        model: source.model,
        requestId: null,
        createdAt: new Date().toISOString(),
      });
      plan.doc = source.doc;
      plan.title = source.doc.title;
      plan.dailyMinutes = minutes(source.doc);
      plan.updatedAt = new Date().toISOString();
      return plan.version;
    });
  }

  requestChange(userId: string, planId: string, kind: "adjust" | "regenerate_session", params: RequestParams) {
    return mutateDemo((store) => {
      const plan = store.plans[planId];
      if (!plan || plan.userId !== userId) throw new PlanNotFoundError();
      const live = Object.values(store.requests).find(
        (r) => r.intakeId === plan.intakeId && (r.status === "queued" || r.status === "processing"),
      );
      if (live) return live.id;
      const id = randomUUID();
      store.requests[id] = {
        id,
        userId,
        intakeId: plan.intakeId,
        manifestationId: plan.manifestationId,
        planId,
        kind,
        params,
        status: "queued",
        attempts: 0,
        baseVersion: plan.version,
        snapshot: plan.intake,
        title: plan.title,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
      };
      return id;
    });
  }

  retry(userId: string, requestId: string) {
    return mutateDemo((store) => {
      const r = store.requests[requestId];
      if (!r || r.userId !== userId || r.status !== "failed" || r.attempts >= MAX_ATTEMPTS) {
        throw new Error("request cannot be retried");
      }
      Object.assign(r, { status: "queued", errorCode: null, errorMessage: null, startedAt: null, completedAt: null });
    });
  }

  async getRequest(userId: string, requestId: string) {
    const r = (await loadDemo()).requests[requestId];
    return r && r.userId === userId ? toStatus(r) : null;
  }

  async latestRequestForPlan(userId: string, planId: string) {
    const r = Object.values((await loadDemo()).requests)
      .filter((x) => x.userId === userId && x.planId === planId && x.kind !== "initial")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return r && r.status !== "completed" && r.status !== "cancelled" ? toStatus(r) : null;
  }

  async countRequestsSince(userId: string, since: Date) {
    return Object.values((await loadDemo()).requests).filter(
      (r) => r.userId === userId && Date.parse(r.createdAt) >= since.getTime(),
    ).length;
  }

  // ---- worker ------------------------------------------------------------------

  claim(requestId: string) {
    return mutateDemo((store): ClaimedRequest | null => {
      const r = store.requests[requestId];
      if (!r || r.attempts >= MAX_ATTEMPTS) return null;
      const stale = r.status === "processing" && r.startedAt && Date.now() - Date.parse(r.startedAt) > STALE_MS;
      if (r.status !== "queued" && !stale) return null;
      Object.assign(r, { status: "processing", startedAt: new Date().toISOString(), attempts: r.attempts + 1, errorCode: null, errorMessage: null });
      return {
        id: r.id,
        userId: r.userId,
        kind: r.kind,
        params: r.params,
        snapshot: r.snapshot,
        planId: r.planId,
        manifestationId: r.manifestationId,
        attempts: r.attempts,
      };
    });
  }

  async loadPlan(planId: string) {
    const p = (await loadDemo()).plans[planId];
    return p ? { doc: p.doc, version: p.version } : null;
  }

  complete(requestId: string, result: CompletedResult) {
    return mutateDemo((store) => {
      const r = store.requests[requestId];
      if (!r || r.status !== "processing") throw new Error("request is not processing");
      const now = new Date().toISOString();
      let planId: string;
      let version: number;
      if (r.kind === "initial") {
        planId = randomUUID();
        version = 1;
        store.plans[planId] = {
          id: planId,
          userId: r.userId,
          intakeId: r.intakeId,
          manifestationId: r.manifestationId,
          title: result.title,
          status: "active",
          structure: result.structure,
          dailyMinutes: result.dailyMinutes,
          doc: result.doc,
          version,
          intake: r.snapshot,
          generationModel: result.model,
          updatedAt: now,
          createdAt: now,
        };
      } else {
        const plan = r.planId ? store.plans[r.planId] : undefined;
        if (!plan) throw new PlanNotFoundError();
        if (plan.version !== result.baseVersion) throw new PlanConflictError();
        planId = plan.id;
        version = plan.version + 1;
        Object.assign(plan, { doc: result.doc, title: result.title, dailyMinutes: result.dailyMinutes, version, generationModel: result.model, updatedAt: now });
      }
      store.versions.push({
        planId,
        userId: r.userId,
        version,
        doc: result.doc,
        source: r.kind === "initial" ? "generated" : r.kind === "adjust" ? "adjusted" : "session_regenerated",
        summary: result.summary,
        model: result.model,
        requestId,
        createdAt: now,
      });
      Object.assign(r, { status: "completed", completedAt: now, planId });
      return { planId, version };
    });
  }

  fail(requestId: string, code: string, message: string, retryable: boolean) {
    return mutateDemo((store) => {
      const r = store.requests[requestId];
      if (!r || r.status !== "processing") return;
      Object.assign(r, {
        status: "failed",
        errorCode: code,
        errorMessage: message.slice(0, 500),
        completedAt: new Date().toISOString(),
        attempts: retryable ? r.attempts : MAX_ATTEMPTS,
      });
    });
  }
}

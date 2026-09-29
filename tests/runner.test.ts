import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { GenerationError, type RoutineGenerator } from "@/lib/ai/generator";
import { LocalRoutineGenerator } from "@/lib/ai/local-generator";
import { loadDemo, mutateDemo } from "@/lib/demo/store";
import { runGenerationRequest } from "@/lib/generation/run";
import type { IntakeSnapshotV2 } from "@/lib/intake/snapshot";
import { DemoPlanStore } from "@/lib/plan/demo-store";

import { officeWorker } from "./fixtures/users";

/**
 * The runner end to end against the real demo store (same semantics as the
 * SQL functions): claim → generate → persist → complete | fail.
 */

const dir = mkdtempSync(path.join(tmpdir(), "assume-runner-"));
process.env.ASSUME_DEMO_DATA_DIR = dir;
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const USER = "user-1";
const store = new DemoPlanStore();
const local = new LocalRoutineGenerator();
const allowed = async () => true;

let seq = 0;
async function queueInitial(snapshot: IntakeSnapshotV2 = officeWorker) {
  const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  await mutateDemo((s) => {
    s.requests[id] = {
      id,
      userId: USER,
      intakeId: `intake-${seq}`,
      manifestationId: `m-${seq}`,
      planId: null,
      kind: "initial",
      params: {},
      status: "queued",
      attempts: 0,
      baseVersion: null,
      snapshot,
      title: snapshot.manifestation.desire,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    };
  });
  return id;
}

function failing(error: Error | unknown): RoutineGenerator {
  const f = async () => {
    if (error instanceof Error) throw error;
    return error;
  };
  return { model: "broken", createPlan: f, adjustPlan: f, regenerateSession: f };
}

beforeEach(async () => {
  await mutateDemo((s) => {
    s.requests = {};
    s.plans = {};
    s.versions = [];
  });
});

describe("generation runner", () => {
  it("builds and saves a first plan (version 1)", async () => {
    const id = await queueInitial();
    const out = await runGenerationRequest(id, { worker: store, generator: local, entitled: allowed });
    expect(out.status).toBe("completed");
    const req = await store.getRequest(USER, id);
    expect(req?.status).toBe("completed");
    const plan = await store.getPlan(USER, req!.planId!);
    expect(plan?.version).toBe(1);
    expect(plan?.doc.sessions.length).toBeGreaterThan(0);
    expect((await store.listVersions(USER, plan!.id))[0].source).toBe("generated");
  });

  it("ignores duplicate runs of the same request", async () => {
    const id = await queueInitial();
    const [a, b] = await Promise.all([
      runGenerationRequest(id, { worker: store, generator: local, entitled: allowed }),
      runGenerationRequest(id, { worker: store, generator: local, entitled: allowed }),
    ]);
    expect([a.status, b.status].sort()).toEqual(["completed", "skipped"]);
    expect(Object.keys((await loadDemo()).plans)).toHaveLength(1);
  });

  it("records a timeout as a retryable failure, and a retry succeeds", async () => {
    const id = await queueInitial();
    const out = await runGenerationRequest(id, { worker: store, generator: failing(new GenerationError("timeout", "slow", true)), entitled: allowed });
    expect(out).toEqual({ status: "failed", code: "timeout" });
    expect((await store.getRequest(USER, id))?.status).toBe("failed");

    await store.retry(USER, id);
    expect((await runGenerationRequest(id, { worker: store, generator: local, entitled: allowed })).status).toBe("completed");
  });

  it("fails with invalid_output when the model keeps returning malformed data", async () => {
    const id = await queueInitial();
    const out = await runGenerationRequest(id, { worker: store, generator: failing({ nope: true }), entitled: allowed });
    expect(out).toEqual({ status: "failed", code: "invalid_output" });
  });

  it("blocks generation without entitlement (non-retryable)", async () => {
    const id = await queueInitial();
    const out = await runGenerationRequest(id, { worker: store, generator: local, entitled: async () => false });
    expect(out).toEqual({ status: "failed", code: "not_entitled" });
    await expect(store.retry(USER, id)).rejects.toThrow();
  });

  it("adjusts a plan as a new version and keeps the user's edits", async () => {
    const id = await queueInitial();
    const { planId } = (await runGenerationRequest(id, { worker: store, generator: local, entitled: allowed })) as { planId: string };
    const plan = (await store.getPlan(USER, planId))!;
    const sats = plan.doc.sessions.find((s) => s.technique === "sats")!;
    const edited = { ...plan.doc, sessions: plan.doc.sessions.map((s) => (s.id === sats.id ? { ...s, startTime: "22:30", userEdited: true } : s)) };
    const v2 = await store.saveEdit(USER, planId, edited, "Moved SATS", plan.version);

    const adj = await store.requestChange(USER, planId, "adjust", {
      kinds: ["lighter"],
      removeTechniques: [],
      scheduleChange: "",
      customInstruction: "",
      keepEditedSessions: true,
    });
    expect((await runGenerationRequest(adj, { worker: store, generator: local, entitled: allowed })).status).toBe("completed");
    const after = (await store.getPlan(USER, planId))!;
    expect(after.version).toBe(v2 + 1);
    expect(after.doc.sessions.find((s) => s.id === sats.id)?.startTime).toBe("22:30");
    expect((await store.listVersions(USER, planId)).map((v) => v.source)).toEqual(["adjusted", "user_edit", "generated"]);
  });

  it("recovers when the user edits the plan mid-generation (conflict → rebuild on the latest version)", async () => {
    const id = await queueInitial();
    const { planId } = (await runGenerationRequest(id, { worker: store, generator: local, entitled: allowed })) as { planId: string };
    let interfered = false;
    const meddling: RoutineGenerator = {
      model: "meddling",
      createPlan: (i) => local.createPlan(i),
      regenerateSession: (i) => local.regenerateSession(i),
      adjustPlan: async (input) => {
        if (!interfered) {
          interfered = true;
          const p = (await store.getPlan(USER, planId))!;
          await store.saveEdit(USER, planId, { ...p.doc, title: "Renamed by me" }, "Renamed", p.version);
        }
        return local.adjustPlan(input);
      },
    };
    const adj = await store.requestChange(USER, planId, "adjust", {
      kinds: ["less_evening"],
      removeTechniques: [],
      scheduleChange: "",
      customInstruction: "",
      keepEditedSessions: true,
    });
    expect((await runGenerationRequest(adj, { worker: store, generator: meddling, entitled: allowed })).status).toBe("completed");
    const versions = await store.listVersions(USER, planId);
    expect(versions.map((v) => v.source)).toEqual(["adjusted", "user_edit", "generated"]);
  });

  it("regenerates one session in place", async () => {
    const id = await queueInitial();
    const { planId } = (await runGenerationRequest(id, { worker: store, generator: local, entitled: allowed })) as { planId: string };
    const before = (await store.getPlan(USER, planId))!;
    // The morning session has real alternatives (they also allow visualization).
    const target = before.doc.sessions.find((s) => !s.contextActivity && s.technique !== "sats")!;
    const req = await store.requestChange(USER, planId, "regenerate_session", { sessionId: target.id, note: "" });
    expect((await runGenerationRequest(req, { worker: store, generator: local, entitled: allowed })).status).toBe("completed");
    const after = (await store.getPlan(USER, planId))!;
    expect(after.doc.sessions.find((s) => s.id === target.id)?.technique).not.toBe(target.technique);
    for (const s of before.doc.sessions.filter((x) => x.id !== target.id)) {
      expect(after.doc.sessions.find((x) => x.id === s.id)).toEqual(s);
    }

    // During the commute only affirmations/subliminals are allowed, so a regenerated
    // commute session must stay within those — never "anything different".
    const commute = after.doc.sessions.find((s) => s.contextActivity === "Commute in")!;
    const req2 = await store.requestChange(USER, planId, "regenerate_session", { sessionId: commute.id, note: "" });
    expect((await runGenerationRequest(req2, { worker: store, generator: local, entitled: allowed })).status).toBe("completed");
    const regenerated = (await store.getPlan(USER, planId))!.doc.sessions.find((s) => s.id === commute.id)!;
    expect(["affirmations", "subliminals"]).toContain(regenerated.technique);
  });

  it("only allows one live change request per plan", async () => {
    const id = await queueInitial();
    const { planId } = (await runGenerationRequest(id, { worker: store, generator: local, entitled: allowed })) as { planId: string };
    const a = await store.requestChange(USER, planId, "regenerate_session", { sessionId: "x", note: "" });
    const b = await store.requestChange(USER, planId, "regenerate_session", { sessionId: "y", note: "" });
    expect(a).toBe(b);
  });

  it("restoring an old version never deletes history", async () => {
    const id = await queueInitial();
    const { planId } = (await runGenerationRequest(id, { worker: store, generator: local, entitled: allowed })) as { planId: string };
    const p = (await store.getPlan(USER, planId))!;
    await store.saveEdit(USER, planId, { ...p.doc, title: "Changed" }, "Renamed", 1);
    const v = await store.restoreVersion(USER, planId, 1);
    expect(v).toBe(3);
    expect((await store.getPlan(USER, planId))!.doc.title).toBe(p.doc.title);
    expect(await store.listVersions(USER, planId)).toHaveLength(3);
  });
});

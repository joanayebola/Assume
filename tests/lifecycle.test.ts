import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { loadDemo, mutateDemo } from "@/lib/demo/store";
import { DemoPlanStore } from "@/lib/plan/demo-store";
import { PLAN_DOC_VERSION, type PlanDoc } from "@/lib/plan/schema";

import { officeWorker } from "./fixtures/users";
import { session } from "./support/plan";

const dir = mkdtempSync(path.join(tmpdir(), "assume-lifecycle-"));
process.env.ASSUME_DEMO_DATA_DIR = dir;
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const USER = "user-life";
const PLAN = "22222222-2222-4222-8222-222222222222";
const store = new DemoPlanStore();

const doc: PlanDoc = {
  docVersion: PLAN_DOC_VERSION,
  title: "SP routine",
  explanation: "",
  philosophy: "",
  manifestation: { id: null, desire: "Reconnect with J" },
  timezone: "Europe/London",
  affirmations: [],
  askfirmations: [],
  patterns: [],
  sessions: [session({ id: "s_one" })],
};

beforeEach(async () => {
  await mutateDemo((s) => {
    s.plans = {
      [PLAN]: {
        id: PLAN,
        userId: USER,
        intakeId: "i",
        manifestationId: "m",
        title: doc.title,
        status: "active",
        structure: "balanced",
        dailyMinutes: 5,
        doc,
        version: 1,
        intake: officeWorker,
        generationModel: null,
        updatedAt: new Date().toISOString(),
      },
    };
    s.versions = [];
    s.checkins = [{ userId: USER, planId: PLAN, sessionId: "s_one", date: "2026-09-29", status: "done", movedTo: null }];
    s.manifested = [];
    s.requests = {};
  });
});

describe("plan lifecycle", () => {
  it("pauses and resumes, tracking when", async () => {
    await store.setStatus(USER, PLAN, "paused");
    let p = await store.getPlan(USER, PLAN);
    expect(p?.status).toBe("paused");
    expect(p?.pausedAt).not.toBeNull();
    await store.setStatus(USER, PLAN, "active");
    p = await store.getPlan(USER, PLAN);
    expect(p).toMatchObject({ status: "active", pausedAt: null });
  });

  it("marks complete, and restoring clears it", async () => {
    await store.setStatus(USER, PLAN, "completed");
    expect((await store.getPlan(USER, PLAN))?.completedAt).not.toBeNull();
    await store.setStatus(USER, PLAN, "active");
    expect((await store.getPlan(USER, PLAN))?.completedAt).toBeNull();
  });

  it("won't touch another person's plan", async () => {
    await expect(store.setStatus("someone-else", PLAN, "archived")).rejects.toThrow();
    await expect(store.deletePlan("someone-else", PLAN)).rejects.toThrow();
  });

  it("duplicates into a new, active plan with its own history", async () => {
    await store.setStatus(USER, PLAN, "paused");
    const copyId = await store.duplicatePlan(USER, PLAN);
    const copy = await store.getPlan(USER, copyId);
    expect(copy).toMatchObject({ status: "active", version: 1, title: "SP routine (copy)" });
    expect(copy?.doc.sessions).toEqual(doc.sessions);
    expect((await store.listVersions(USER, copyId))[0].source).toBe("duplicated");
  });

  it("deletes a plan with its check-ins, keeping archive entries (unlinked)", async () => {
    const entry = await store.addManifested(USER, { planId: PLAN, title: doc.title, desire: doc.manifestation.desire, note: null, manifestedOn: "2026-09-29" });
    await store.deletePlan(USER, PLAN);
    expect(await store.getPlan(USER, PLAN)).toBeNull();
    const s = await loadDemo();
    expect(s.checkins).toEqual([]);
    const [kept] = await store.listManifested(USER);
    expect(kept).toMatchObject({ id: entry.id, planId: null, desire: "Reconnect with J" });
  });

  it("keeps one archive entry per plan (saving again updates it)", async () => {
    await store.addManifested(USER, { planId: PLAN, title: "t", desire: "d", note: "first", manifestedOn: "2026-09-20" });
    await store.addManifested(USER, { planId: PLAN, title: "t", desire: "d", note: "second", manifestedOn: "2026-09-21" });
    const list = await store.listManifested(USER);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ note: "second", manifestedOn: "2026-09-21" });
    await store.deleteManifested(USER, list[0].id);
    expect(await store.listManifested(USER)).toEqual([]);
  });

  it("lists every plan, whatever its status", async () => {
    await store.setStatus(USER, PLAN, "archived");
    expect((await store.listPlanRecords(USER)).map((p) => p.status)).toEqual(["archived"]);
  });
});

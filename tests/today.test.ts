import { describe, expect, it } from "vitest";

import { zonedToUtc } from "@/lib/calendar/zoned";
import type { Weekday } from "@/lib/intake/model";
import { PLAN_DOC_VERSION, recurrenceFor, type PlanDoc, type Session } from "@/lib/plan/schema";
import type { PlanRecord, PlanStatus } from "@/lib/plan/store";
import { buildAgenda, nextOccurrence } from "@/lib/today/agenda";
import type { Checkin } from "@/lib/today/store";

import { session } from "./support/plan";

const at = (days: Weekday[], startTime: string, extra: Partial<Session> = {}) =>
  session({ days, recurrence: recurrenceFor(days), startTime, durationMinutes: 3, ...extra });

let n = 0;
function plan(sessions: Session[], timezone = "Europe/London", status: PlanStatus = "active"): PlanRecord {
  const doc: PlanDoc = {
    docVersion: PLAN_DOC_VERSION,
    title: `Plan ${++n}`,
    explanation: "",
    philosophy: "",
    manifestation: { id: null, desire: "Something good" },
    timezone,
    affirmations: [],
    askfirmations: [],
    patterns: [],
    sessions,
  };
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    title: doc.title,
    doc,
    version: 1,
    status,
    structure: "balanced",
    intakeId: null,
    manifestationId: null,
    generationModel: null,
    updatedAt: "2026-09-01T00:00:00Z",
    createdAt: "2026-09-01T00:00:00Z",
    pausedAt: null,
    completedAt: null,
  };
}

// Tuesday 29 Sep 2026, 12:00 in London (11:00Z).
const NOON_TUE = Date.UTC(2026, 8, 29, 11, 0);

describe("Today", () => {
  it("lists today's sessions from every active plan in chronological order", () => {
    const a = plan([at([1, 2, 3, 4, 5, 6, 7], "22:45", { title: "SATS" }), at([2], "07:30", { title: "Morning affirmations" })]);
    const b = plan([at([1, 2, 3, 4, 5], "13:00", { title: "Askfirmations" })]);
    const agenda = buildAgenda({ plans: [a, b], checkins: [], viewerTimeZone: "Europe/London", now: NOON_TUE });
    expect(agenda.date).toBe("2026-09-29");
    expect(agenda.items.map((i) => [i.time, i.title])).toEqual([
      ["07:30", "Morning affirmations"],
      ["13:00", "Askfirmations"],
      ["22:45", "SATS"],
    ]);
  });

  it("leaves out paused, completed and archived plans", () => {
    const plans = (["paused", "completed", "archived"] as const).map((s) => plan([at([2], "09:00")], "Europe/London", s));
    const agenda = buildAgenda({ plans, checkins: [], viewerTimeZone: "Europe/London", now: NOON_TUE });
    expect(agenda.items).toEqual([]);
    expect(agenda.activePlans).toBe(0);
  });

  it("is empty on a day with nothing scheduled (weekend-only routine on a Tuesday)", () => {
    const agenda = buildAgenda({ plans: [plan([at([6, 7], "09:00")])], checkins: [], viewerTimeZone: "Europe/London", now: NOON_TUE });
    expect(agenda.items).toEqual([]);
    expect(agenda.activePlans).toBe(1);
  });

  it("shows plan times converted into the viewer's timezone", () => {
    // A London routine at 07:30 is 02:30 in New York.
    const agenda = buildAgenda({ plans: [plan([at([2], "07:30")])], checkins: [], viewerTimeZone: "America/New_York", now: NOON_TUE });
    expect(agenda.items.map((i) => i.time)).toEqual(["02:30"]);
  });

  it("uses the viewer's calendar day, even when the plan's date differs", () => {
    // Tokyo plan, Tuesday 06:00 Tokyo = Monday 22:00 London. At noon Monday London, it's on Monday's list.
    const tokyo = plan([at([2], "06:00")], "Asia/Tokyo");
    const mondayNoon = Date.UTC(2026, 8, 28, 11, 0);
    const agenda = buildAgenda({ plans: [tokyo], checkins: [], viewerTimeZone: "Europe/London", now: mondayNoon });
    expect(agenda.items).toHaveLength(1);
    expect(agenda.items[0].time).toBe("22:00");
    expect(agenda.items[0].occurrenceDate).toBe("2026-09-29"); // keyed by the plan's own date
  });

  it("keeps wall-clock times on a DST day", () => {
    const sunday = Date.UTC(2026, 9, 25, 12, 0); // clocks went back that morning in London
    const agenda = buildAgenda({ plans: [plan([at([7], "07:30"), at([7], "22:45")])], checkins: [], viewerTimeZone: "Europe/London", now: sunday });
    expect(agenda.items.map((i) => i.time)).toEqual(["07:30", "22:45"]);
  });

  it("applies Done and Skip to the right occurrence only", () => {
    const p = plan([at([1, 2, 3, 4, 5, 6, 7], "07:30"), at([1, 2, 3, 4, 5, 6, 7], "13:00")]);
    const [s1, s2] = p.doc.sessions;
    const checkins: Checkin[] = [
      { planId: p.id, sessionId: s1.id, date: "2026-09-29", status: "done", movedTo: null },
      { planId: p.id, sessionId: s2.id, date: "2026-09-29", status: "skipped", movedTo: null },
      { planId: p.id, sessionId: s1.id, date: "2026-09-28", status: "skipped", movedTo: null }, // yesterday
    ];
    const agenda = buildAgenda({ plans: [p], checkins, viewerTimeZone: "Europe/London", now: NOON_TUE });
    expect(agenda.items.map((i) => i.status)).toEqual(["done", "skipped"]);
  });

  it("moves a session for today only, and re-sorts", () => {
    const p = plan([at([1, 2, 3, 4, 5, 6, 7], "07:30", { title: "A" }), at([1, 2, 3, 4, 5, 6, 7], "13:00", { title: "B" })]);
    const movedTo = new Date(zonedToUtc("2026-09-29", "18:15", "Europe/London")).toISOString();
    const checkins: Checkin[] = [{ planId: p.id, sessionId: p.doc.sessions[0].id, date: "2026-09-29", status: null, movedTo }];
    const today = buildAgenda({ plans: [p], checkins, viewerTimeZone: "Europe/London", now: NOON_TUE });
    expect(today.items.map((i) => [i.title, i.time, i.moved])).toEqual([
      ["B", "13:00", false],
      ["A", "18:15", true],
    ]);
    expect(today.items[1].originalTime).toBe("07:30");
    const tomorrow = buildAgenda({ plans: [p], checkins, viewerTimeZone: "Europe/London", now: NOON_TUE + 86_400_000 });
    expect(tomorrow.items.map((i) => i.time)).toEqual(["07:30", "13:00"]);
  });

  it("includes routines crossing midnight on the day they start", () => {
    const p = plan([at([2], "23:50", { durationMinutes: 20 })]);
    const agenda = buildAgenda({ plans: [p], checkins: [], viewerTimeZone: "Europe/London", now: NOON_TUE });
    expect(agenda.items.map((i) => i.time)).toEqual(["23:50"]);
  });

  it("follows a routine moved to a new timezone", () => {
    const p = plan([at([2], "07:30")], "America/New_York");
    const agenda = buildAgenda({ plans: [p], checkins: [], viewerTimeZone: "America/New_York", now: Date.UTC(2026, 8, 29, 16, 0) });
    expect(agenda.items.map((i) => i.time)).toEqual(["07:30"]);
  });

  it("falls back safely when a timezone is invalid", () => {
    const p = plan([at([2], "07:30")], "Not/AZone");
    const agenda = buildAgenda({ plans: [p], checkins: [], viewerTimeZone: "Also/Bad", now: NOON_TUE });
    expect(agenda.timeZone).toBe("UTC");
    expect(agenda.items).toHaveLength(1);
  });
});

describe("next session", () => {
  it("finds the soonest upcoming occurrence across sessions", () => {
    const p = plan([at([3], "09:00", { title: "Wed" }), at([2], "22:45", { title: "Tonight" })]);
    expect(nextOccurrence(p, NOON_TUE)?.title).toBe("Tonight");
  });

  it("skips occurrences that already started today", () => {
    const p = plan([at([1, 2, 3, 4, 5, 6, 7], "07:30")]);
    const next = nextOccurrence(p, NOON_TUE)!;
    expect(new Date(next.start).toISOString()).toBe("2026-09-30T06:30:00.000Z");
  });

  it("is null for paused plans", () => {
    expect(nextOccurrence(plan([at([2], "22:00")], "Europe/London", "paused"), NOON_TUE)).toBeNull();
  });
});

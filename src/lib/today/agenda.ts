import { occurrencesBetween } from "@/lib/calendar/recurrence";
import { addDays, dayBounds, safeTimeZone, todayIn, utcToZoned } from "@/lib/calendar/zoned";
import type { PlanRecord } from "@/lib/plan/store";
import { techniqueLabel } from "@/lib/plan/view";

import type { Checkin, CheckinStatus } from "./store";

/**
 * Today = every occurrence from active plans that starts during the viewer's
 * local day, in chronological order. Plans keep their own timezone; times
 * are shown in the viewer's. Paused/completed/archived plans never appear.
 */

const DAY_MS = 86_400_000;

export type AgendaItem = {
  key: string;
  planId: string;
  planTitle: string;
  sessionId: string;
  title: string;
  technique: string;
  durationMinutes: number;
  optional: boolean;
  contextActivity: string;
  instructions: string;
  /** Instant it starts (after any move). */
  start: number;
  /** Wall time in the viewer's zone, "HH:MM". */
  time: string;
  /** Scheduled wall time in the viewer's zone before a move. */
  originalTime: string;
  /** Scheduled instant before any move. */
  originalStart: number;
  moved: boolean;
  status: CheckinStatus | null;
  /** Occurrence date in the plan's timezone (the check-in key). */
  occurrenceDate: string;
  planTimeZone: string;
};

export type Agenda = { date: string; timeZone: string; items: AgendaItem[]; activePlans: number };

export const checkinKey = (planId: string, sessionId: string, date: string) => `${planId}|${sessionId}|${date}`;

export function isLive(p: Pick<PlanRecord, "status">) {
  return p.status === "active" || p.status === "ready";
}

export function buildAgenda(p: { plans: PlanRecord[]; checkins: Checkin[]; viewerTimeZone: string; now: number }): Agenda {
  const timeZone = safeTimeZone(p.viewerTimeZone);
  const date = todayIn(timeZone, p.now);
  const { start: dayStart, end: dayEnd } = dayBounds(date, timeZone);
  const checkins = new Map(p.checkins.map((c) => [checkinKey(c.planId, c.sessionId, c.date), c]));
  const live = p.plans.filter(isLive);
  const items: AgendaItem[] = [];

  for (const plan of live) {
    const planTz = safeTimeZone(plan.doc.timezone);
    for (const session of plan.doc.sessions) {
      // Look a day either side so moved occurrences can arrive from (or leave to) neighbouring days.
      for (const occ of occurrencesBetween(session, planTz, dayStart - DAY_MS, dayEnd + DAY_MS)) {
        const checkin = checkins.get(checkinKey(plan.id, session.id, occ.date));
        const movedTo = checkin?.movedTo ? Date.parse(checkin.movedTo) : null;
        const start = movedTo ?? occ.start;
        if (start < dayStart || start >= dayEnd) continue;
        items.push({
          key: checkinKey(plan.id, session.id, occ.date),
          planId: plan.id,
          planTitle: plan.doc.title,
          sessionId: session.id,
          title: session.title,
          technique: techniqueLabel(session),
          durationMinutes: session.durationMinutes,
          optional: session.optional,
          contextActivity: session.contextActivity,
          instructions: session.instructions,
          start,
          time: utcToZoned(start, timeZone).time,
          originalTime: utcToZoned(occ.start, timeZone).time,
          originalStart: occ.start,
          moved: movedTo !== null,
          status: checkin?.status ?? null,
          occurrenceDate: occ.date,
          planTimeZone: planTz,
        });
      }
    }
  }

  items.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
  return { date, timeZone, items, activePlans: live.length };
}

/** The dates (plan-local) whose check-ins could affect the viewer's today. */
export function checkinWindow(viewerTimeZone: string, now: number) {
  const today = todayIn(safeTimeZone(viewerTimeZone), now);
  return { from: addDays(today, -2), to: addDays(today, 2) };
}

/** Next upcoming occurrence of a plan (within 8 days), ignoring check-ins. */
export function nextOccurrence(plan: PlanRecord, now: number) {
  if (!isLive(plan)) return null;
  const tz = safeTimeZone(plan.doc.timezone);
  let best: { start: number; sessionId: string; title: string } | null = null;
  for (const s of plan.doc.sessions) {
    const [first] = occurrencesBetween(s, tz, now, now + 8 * DAY_MS);
    if (first && (!best || first.start < best.start)) best = { start: first.start, sessionId: s.id, title: s.title };
  }
  return best;
}

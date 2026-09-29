import "server-only";

import { cache } from "react";

import { getViewer, requireUser } from "@/lib/auth/session";
import { getCalendarStore } from "@/lib/calendar";
import { calendarBadge, planCalendarStatus, type CalendarBadge } from "@/lib/calendar/status";
import type { ConnectionInfo, ExportRecord } from "@/lib/calendar/store";
import { safeTimeZone } from "@/lib/calendar/zoned";
import { getSiteUrl } from "@/lib/env";
import { getPlanStore } from "@/lib/plan";
import type { PlanRecord, PlanSummary } from "@/lib/plan/store";
import { dailyEstimate } from "@/lib/plan/view";
import { nextOccurrence } from "@/lib/today/agenda";
import type { Enums } from "@/types/database";
import { logError } from "@/lib/log";

export type { PlanSummary };

/**
 * The signed-in user's plans, newest first (RLS limits rows to the owner).
 * Returns `error` instead of throwing so pages can degrade gracefully
 * (e.g. before migrations have been applied).
 */
export const listPlans = cache(async (): Promise<{ plans: PlanSummary[]; error: string | null }> => {
  const user = await requireUser();
  try {
    const store = await getPlanStore();
    return { plans: await store.listPlans(user.id), error: null };
  } catch (error) {
    logError("listPlans", error);
    return { plans: [], error: "We couldn't load your plans right now." };
  }
});

/** Every plan with its routine — shared by Today and My Plans in one render. */
export const listPlanRecords = cache(async (): Promise<{ plans: PlanRecord[]; error: string | null }> => {
  const user = await requireUser();
  try {
    return { plans: await (await getPlanStore()).listPlanRecords(user.id), error: null };
  } catch (error) {
    logError("listPlanRecords", error);
    return { plans: [], error: "We couldn't load your plans right now." };
  }
});

/** Calendar exports + Google connection, tolerant of missing migrations. */
export const loadCalendarState = cache(async (): Promise<{ exports: ExportRecord[]; connection: ConnectionInfo | null }> => {
  const user = await requireUser();
  try {
    const store = await getCalendarStore();
    const [exports, connection] = await Promise.all([store.listExports(user.id), store.getConnection(user.id, "google")]);
    return { exports, connection };
  } catch (error) {
    logError("loadCalendarState", error);
    return { exports: [], connection: null };
  }
});

export type PlanCard = {
  id: string;
  title: string;
  desire: string;
  status: Enums<"plan_status">;
  structure: Enums<"routine_style">;
  daily: string;
  sessionCount: number;
  /** Instant of the next session, and its name. */
  next: { start: number; title: string } | null;
  timeZone: string;
  calendar: CalendarBadge;
  updatedAt: string;
  completedAt: string | null;
};

export const listPlanCards = cache(async (): Promise<{ cards: PlanCard[]; viewerTimeZone: string; now: number; error: string | null }> => {
  const [{ profile }, { plans, error }, { exports, connection }] = await Promise.all([getViewer(), listPlanRecords(), loadCalendarState()]);
  const now = Date.now();
  const siteUrl = getSiteUrl();
  const cards = plans.map((p) => ({
    id: p.id,
    title: p.doc.title,
    desire: p.doc.manifestation.desire,
    status: p.status,
    structure: p.structure,
    daily: dailyEstimate(p.doc),
    sessionCount: p.doc.sessions.length,
    next: nextOccurrence(p, now),
    timeZone: safeTimeZone(p.doc.timezone),
    calendar: calendarBadge(planCalendarStatus({ doc: p.doc, planId: p.id, exports, connection, siteUrl })),
    updatedAt: p.updatedAt,
    completedAt: p.completedAt,
  }));
  return { cards, viewerTimeZone: safeTimeZone(profile.timezone), now, error };
});

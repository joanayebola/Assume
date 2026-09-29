import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import type { CalendarContext, ExportSummary } from "@/components/calendar/types";
import { PlanView } from "@/components/plan/plan-view";
import { LOCAL_GENERATOR_MODEL } from "@/lib/ai/local-generator";
import { getViewer } from "@/lib/auth/session";
import { getCalendarStore, isGoogleCalendarAvailable } from "@/lib/calendar";
import { DEFAULT_CALENDAR_PREFERENCES } from "@/lib/calendar/model";
import { planCalendarStatus, type ProviderStatus } from "@/lib/calendar/status";
import { safeTimeZone, todayIn } from "@/lib/calendar/zoned";
import { getSiteUrl } from "@/lib/env";
import { getPlanStore } from "@/lib/plan";
import type { PlanRecord } from "@/lib/plan/store";
import { todayIn as weekdayToday } from "@/lib/plan/view";

import PlanLoading from "./loading";
import { logError } from "@/lib/log";
import { track } from "@/lib/analytics/server";

export const metadata: Metadata = { title: "My routine" };
// Server actions on this page can start generation work.
export const maxDuration = 300;

const summary = (s: ProviderStatus | null): ExportSummary | null =>
  s && {
    options: s.record.options,
    lastExportedAt: s.record.lastExportedAt,
    eventCount: s.record.eventCount,
    exportCount: s.record.exportCount,
    state: s.state,
  };

async function calendarContext(userId: string, plan: PlanRecord, viewerTimeZone: string): Promise<CalendarContext> {
  const siteUrl = getSiteUrl();
  const base: CalendarContext = {
    planId: plan.id,
    siteUrl,
    planToday: todayIn(safeTimeZone(plan.doc.timezone)),
    viewerTimeZone,
    googleAvailable: isGoogleCalendarAvailable(),
    google: { connected: false, needsReconnect: false, calendarName: null },
    preferences: DEFAULT_CALENDAR_PREFERENCES,
    exports: { ics: null, google: null },
  };
  try {
    const store = await getCalendarStore();
    const [preferences, exports, connection] = await Promise.all([
      store.getPreferences(userId),
      store.listExports(userId),
      store.getConnection(userId, "google"),
    ]);
    const status = planCalendarStatus({ doc: plan.doc, planId: plan.id, exports, connection, siteUrl });
    return {
      ...base,
      preferences,
      google: { connected: Boolean(connection), needsReconnect: connection?.status === "needs_reconnect", calendarName: connection?.calendarName ?? null },
      exports: { ics: summary(status.ics), google: summary(status.google) },
    };
  } catch (error) {
    // Calendar tables missing (migration not applied) shouldn't break the plan.
    logError("plan:calendar", error);
    return base;
  }
}

export default async function PlanPage({ params }: PageProps<"/plans/[planId]">) {
  const { planId } = await params;
  if (!z.uuid().safeParse(planId).success) notFound();

  const viewer = await getViewer();
  const store = await getPlanStore();
  const plan = await store.getPlan(viewer.user.id, planId);
  if (!plan) notFound();

  const viewerTimeZone = safeTimeZone(viewer.profile.timezone);
  track("plan_viewed", viewer.user.id);
  const [versions, latestRequest, calendar] = await Promise.all([
    store.listVersions(viewer.user.id, planId),
    store.latestRequestForPlan(viewer.user.id, planId),
    calendarContext(viewer.user.id, plan, viewerTimeZone),
  ]);

  return (
    <Suspense fallback={<PlanLoading />}>
      {/* Keyed by version so a refreshed server version replaces local state. */}
      <PlanView
        key={plan.version}
        planId={plan.id}
        initialDoc={plan.doc}
        initialVersion={plan.version}
        versions={versions}
        today={weekdayToday(plan.doc.timezone)}
        latestRequest={latestRequest}
        builtOffline={plan.generationModel === LOCAL_GENERATOR_MODEL}
        lifecycle={{ status: plan.status, pausedAt: plan.pausedAt, completedAt: plan.completedAt }}
        calendar={calendar}
      />
    </Suspense>
  );
}

import "server-only";

import { getViewer } from "@/lib/auth/session";
import { safeTimeZone } from "@/lib/calendar/zoned";
import { getCheckinStore } from "@/lib/today";
import { buildAgenda, checkinWindow, type Agenda } from "@/lib/today/agenda";
import type { Checkin } from "@/lib/today/store";

import { listPlanRecords } from "./plans";
import { logError } from "@/lib/log";

/** Today's sessions across active plans, in the viewer's timezone. */
export async function loadToday(now = Date.now()): Promise<{ agenda: Agenda; error: string | null }> {
  const [{ user, profile }, { plans, error }] = await Promise.all([getViewer(), listPlanRecords()]);
  const viewerTimeZone = safeTimeZone(profile.timezone);
  let checkins: Checkin[] = [];
  try {
    const window = checkinWindow(viewerTimeZone, now);
    checkins = await (await getCheckinStore()).list(user.id, window.from, window.to);
  } catch (e) {
    // Today still works without check-ins (e.g. migration not applied yet).
    logError("loadToday:checkins", e);
  }
  return { agenda: buildAgenda({ plans, checkins, viewerTimeZone, now }), error };
}

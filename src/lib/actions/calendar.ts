"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getCalendarStore, isGoogleCalendarAvailable } from "@/lib/calendar";
import { buildEvents, calendarPreferencesSchema, exportFingerprint, exportOptionsSchema, type ExportOptions } from "@/lib/calendar/model";
import {
  disconnectGoogle,
  GooglePartialSyncError,
  GoogleReconnectError,
  removePlanFromGoogle,
  syncPlanToGoogle,
  type GoogleSyncResult,
} from "@/lib/calendar/service";
import { CalendarNotConfiguredError } from "@/lib/calendar/store";
import { getSiteUrl } from "@/lib/env";
import { getPlanStore } from "@/lib/plan";
import { routes } from "@/lib/site";
import { logError } from "@/lib/log";
import { track } from "@/lib/analytics/server";

export type CalendarActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; code: "auth" | "not_found" | "invalid" | "reconnect" | "not_configured" | "partial" | "error"; message: string };

const uuid = z.uuid();
const SESSION_EXPIRED = { ok: false, code: "auth", message: "Your session has expired. Log in again." } as const;
const NOT_FOUND = { ok: false, code: "not_found", message: "We couldn't find this routine." } as const;

function failure(error: unknown, context: string): Extract<CalendarActionResult, { ok: false }> {
  if (error instanceof GoogleReconnectError) {
    return { ok: false, code: "reconnect", message: "Google Calendar needs you to reconnect. Nothing was changed in your calendar." };
  }
  if (error instanceof GooglePartialSyncError) {
    return {
      ok: false,
      code: "partial",
      message: `Most events were saved, but ${error.failed} couldn't be. Try again — nothing will be duplicated.`,
    };
  }
  if (error instanceof CalendarNotConfiguredError) {
    return { ok: false, code: "not_configured", message: "Google Calendar isn't switched on for this environment." };
  }
  logError(`calendar:${context}`, error);
  return { ok: false, code: "error", message: "We couldn't reach your calendar. Please try again in a moment." };
}

async function loadPlan(userId: string, planId: string) {
  if (!uuid.safeParse(planId).success) return null;
  return (await getPlanStore()).getPlan(userId, planId);
}

function parseOptions(raw: unknown): { ok: true; options: ExportOptions } | { ok: false; message: string } {
  const parsed = exportOptionsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check your calendar choices." };
  return { ok: true, options: parsed.data };
}

/** Encodes export options for the stateless .ics download route. */
function icsUrl(planId: string, options: ExportOptions, sequence: number) {
  const o = Buffer.from(JSON.stringify(options), "utf8").toString("base64url");
  return `/api/calendar/plans/${planId}/ics?o=${o}&seq=${sequence}`;
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export async function saveCalendarPreferences(raw: unknown): Promise<CalendarActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const parsed = calendarPreferencesSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "invalid", message: parsed.error.issues[0]?.message ?? "Check your choices." };
  if (parsed.data.titleStyle === "custom" && !parsed.data.customTitle) {
    return { ok: false, code: "invalid", message: "Write the title you'd like to see." };
  }
  try {
    await (await getCalendarStore()).savePreferences(user.id, parsed.data);
    revalidatePath(routes.settings);
    return { ok: true };
  } catch (error) {
    return failure(error, "prefs");
  }
}

// ---------------------------------------------------------------------------
// .ics
// ---------------------------------------------------------------------------

/**
 * Validates an export and returns the download URL. Full-routine exports are
 * recorded (to detect later edits and warn before duplicate imports);
 * single-event exports aren't.
 */
export async function prepareIcsExport(
  planId: string,
  rawOptions: unknown,
  recordExport: boolean,
): Promise<CalendarActionResult<{ url: string; eventCount: number }>> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const parsed = parseOptions(rawOptions);
  if (!parsed.ok) return { ok: false, code: "invalid", message: parsed.message };
  try {
    const plan = await loadPlan(user.id, planId);
    if (!plan) return NOT_FOUND;
    const events = buildEvents(plan.doc, { planId, options: parsed.options, siteUrl: getSiteUrl() });
    if (!events.length) return { ok: false, code: "invalid", message: "None of the chosen sessions happen between those dates." };

    let sequence = 0;
    if (recordExport) {
      const store = await getCalendarStore();
      const record = await store.recordExport(user.id, {
        planId,
        provider: "ics",
        options: parsed.options,
        fingerprint: exportFingerprint(events),
        planVersion: plan.version,
        eventCount: events.length,
      });
      sequence = record.exportCount - 1;
      revalidatePath(`${routes.plans}/${planId}`);
    }
    track("routine_exported", user.id, { provider: "ics", events: events.length, single: !recordExport });
    return { ok: true, url: icsUrl(planId, parsed.options, sequence), eventCount: events.length };
  } catch (error) {
    return failure(error, "ics");
  }
}

/** "I've dealt with it" — forget an .ics export (e.g. after deleting the events). */
export async function forgetIcsExport(planId: string): Promise<CalendarActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  if (!uuid.safeParse(planId).success) return NOT_FOUND;
  try {
    await (await getCalendarStore()).deleteExport(user.id, planId, "ics");
    revalidatePath(`${routes.plans}/${planId}`);
    return { ok: true };
  } catch (error) {
    return failure(error, "ics:forget");
  }
}

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

export async function syncGoogleCalendar(planId: string, rawOptions: unknown): Promise<CalendarActionResult<{ result: GoogleSyncResult }>> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  if (!isGoogleCalendarAvailable()) return failure(new CalendarNotConfiguredError("Google Calendar"), "google");
  const parsed = parseOptions(rawOptions);
  if (!parsed.ok) return { ok: false, code: "invalid", message: parsed.message };
  try {
    const plan = await loadPlan(user.id, planId);
    if (!plan) return NOT_FOUND;
    const store = await getCalendarStore();
    const result = await syncPlanToGoogle(store, {
      userId: user.id,
      planId,
      doc: plan.doc,
      version: plan.version,
      options: parsed.options,
      siteUrl: getSiteUrl(),
    });
    revalidatePath(`${routes.plans}/${planId}`);
    revalidatePath(routes.plans);
    track("routine_exported", user.id, { provider: "google", events: result.eventCount, single: false });
    return { ok: true, result };
  } catch (error) {
    return failure(error, "google:sync");
  } finally {
    revalidatePath(routes.settings);
  }
}

/** Re-sync with the settings used last time ("Update calendar"). */
export async function updateGoogleCalendar(planId: string): Promise<CalendarActionResult<{ result: GoogleSyncResult }>> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  if (!uuid.safeParse(planId).success) return NOT_FOUND;
  try {
    const record = await (await getCalendarStore()).getExport(user.id, planId, "google");
    if (!record) return { ok: false, code: "not_found", message: "This routine isn't in Google Calendar yet." };
    return syncGoogleCalendar(planId, record.options);
  } catch (error) {
    return failure(error, "google:update");
  }
}

export async function removeFromGoogleCalendar(planId: string): Promise<CalendarActionResult<{ removed: number }>> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  if (!uuid.safeParse(planId).success) return NOT_FOUND;
  try {
    const removed = await removePlanFromGoogle(await getCalendarStore(), user.id, planId);
    revalidatePath(`${routes.plans}/${planId}`);
    revalidatePath(routes.plans);
    return { ok: true, removed };
  } catch (error) {
    return failure(error, "google:remove");
  }
}

export async function disconnectGoogleCalendar(removeCalendar: boolean): Promise<CalendarActionResult<{ calendarRemoved: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  try {
    const { calendarRemoved } = await disconnectGoogle(await getCalendarStore(), user.id, Boolean(removeCalendar));
    revalidatePath("/", "layout");
    return { ok: true, calendarRemoved };
  } catch (error) {
    return failure(error, "google:disconnect");
  }
}

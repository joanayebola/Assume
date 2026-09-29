import { z } from "zod";

import type { Technique, Weekday } from "@/lib/intake/model";
import type { PlanDoc, Session } from "@/lib/plan/schema";
import { techniqueLabel } from "@/lib/plan/view";

import { fingerprintOf } from "./fingerprint";
import { addDays, isLocalDate, safeTimeZone, utcToZoned, weekdayOf, zonedToUtc, type LocalDate, type LocalTime } from "./zoned";

/**
 * Provider-independent calendar events.
 *
 * Every export path (.ics download, Google Calendar) starts from the same
 * `CalendarEvent`s built here, so titles, privacy, recurrence and timezones
 * behave identically everywhere. One routine session = one recurring event.
 */

export const CALENDAR_PROVIDERS = ["ics", "google"] as const;
export type CalendarProvider = (typeof CALENDAR_PROVIDERS)[number];

export const TITLE_STYLES = ["descriptive", "private", "very_private", "custom"] as const;
export type TitleStyle = (typeof TITLE_STYLES)[number];

export const PRIVATE_TITLE = "Manifestation session";
export const VERY_PRIVATE_TITLE = "Personal time";

export const REMINDER_OPTIONS = [null, 0, 5, 10, 15, 30] as const;

export const calendarPreferencesSchema = z.object({
  titleStyle: z.enum(TITLE_STYLES),
  customTitle: z.string().trim().max(80, { error: "Keep it under 80 characters." }),
  include: z.object({
    affirmations: z.boolean(),
    instructions: z.boolean(),
    visualization: z.boolean(),
    link: z.boolean(),
  }),
  /** Minutes before the session; null = no reminder. */
  reminderMinutes: z.number().int().min(0).max(120).nullable(),
});
export type CalendarPreferences = z.infer<typeof calendarPreferencesSchema>;

/** Private by default: a neutral title and nothing personal in the description. */
export const DEFAULT_CALENDAR_PREFERENCES: CalendarPreferences = {
  titleStyle: "private",
  customTitle: "",
  include: { affirmations: false, instructions: false, visualization: false, link: true },
  reminderMinutes: 0,
};

export function parsePreferences(raw: unknown): CalendarPreferences {
  const parsed = calendarPreferencesSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_CALENDAR_PREFERENCES;
}

const localDate = z.string().refine(isLocalDate, { error: "Pick a valid date." });

export const exportOptionsSchema = z
  .object({
    /** Sessions left out. New sessions added later are included by default. */
    excludedSessionIds: z.array(z.string().min(1).max(40)).max(60),
    startDate: localDate,
    endDate: localDate.nullable(),
    preferences: calendarPreferencesSchema,
  })
  .refine((o) => !o.endDate || o.endDate >= o.startDate, { error: "The end date is before the start date.", path: ["endDate"] })
  .refine((o) => o.preferences.titleStyle !== "custom" || o.preferences.customTitle.length > 0, {
    error: "Write the title you'd like to see.",
    path: ["preferences", "customTitle"],
  });
export type ExportOptions = z.infer<typeof exportOptionsSchema>;

export type SyncState = "not_exported" | "exported" | "synced" | "out_of_date" | "error";

export type Recurrence = {
  /** DAILY when every weekday is selected, otherwise WEEKLY + BYDAY. */
  freq: "DAILY" | "WEEKLY";
  byDay: Weekday[];
  /** Last local date (inclusive) an occurrence may start on, or null for no end. */
  until: LocalDate | null;
};

export type CalendarEvent = {
  /** Stable across exports: `<planId>-<sessionId>@assume`. */
  uid: string;
  planId: string;
  sessionId: string;
  /** Privacy-safe display title — what appears in the calendar. */
  title: string;
  description: string | null;
  url: string | null;
  /** Full internal details; never sent to a calendar unless chosen. */
  internal: {
    sessionTitle: string;
    technique: Technique;
    techniqueLabel: string;
    instructions: string;
    optional: boolean;
  };
  timezone: string;
  /** First occurrence, local wall time in `timezone`. */
  start: { date: LocalDate; time: LocalTime };
  /** Local end of the first occurrence; `date` is the next day when a session crosses midnight. */
  end: { date: LocalDate; time: LocalTime };
  durationMinutes: number;
  recurrence: Recurrence;
  weekdays: Weekday[];
  reminderMinutes: number | null;
  /** Hash of everything a calendar would show; changes ⇒ calendar is out of date. */
  fingerprint: string;
};

export type ExternalEventLink = {
  sessionId: string;
  provider: CalendarProvider;
  externalId: string;
  fingerprint: string;
};

// ---------------------------------------------------------------------------
// Titles & descriptions
// ---------------------------------------------------------------------------

export function titleFor(session: Pick<Session, "title">, prefs: Pick<CalendarPreferences, "titleStyle" | "customTitle">): string {
  switch (prefs.titleStyle) {
    case "descriptive":
      return session.title.trim() || PRIVATE_TITLE;
    case "private":
      return PRIVATE_TITLE;
    case "very_private":
      return VERY_PRIVATE_TITLE;
    case "custom":
      return prefs.customTitle.trim() || VERY_PRIVATE_TITLE;
  }
}

export function planLink(siteUrl: string, planId: string) {
  return `${siteUrl.replace(/\/$/, "")}/plans/${planId}`;
}

export function descriptionFor(
  session: Session,
  doc: Pick<PlanDoc, "affirmations" | "askfirmations">,
  include: CalendarPreferences["include"],
  link: string | null,
): string | null {
  const blocks: string[] = [];
  if (include.instructions) {
    blocks.push(session.instructions.trim());
    if (session.scriptingPrompt.trim()) blocks.push(`Write: ${session.scriptingPrompt.trim()}`);
  }
  if (include.affirmations) {
    const texts = (ids: string[], list: PlanDoc["affirmations"]) =>
      ids.map((id) => list.find((a) => a.id === id)?.text).filter((t): t is string => Boolean(t));
    const lines = [...texts(session.affirmationIds, doc.affirmations), ...texts(session.askfirmationIds, doc.askfirmations)];
    if (lines.length) blocks.push(lines.map((l) => `• ${l}`).join("\n"));
  }
  if (include.visualization && session.visualizationPrompt.trim()) {
    blocks.push(`Scene: ${session.visualizationPrompt.trim()}`);
  }
  if (include.link && link) blocks.push(`Open in Assume: ${link}`);
  const text = blocks.filter(Boolean).join("\n\n").trim();
  return text ? text.slice(0, 7000) : null;
}

// ---------------------------------------------------------------------------
// Recurrence
// ---------------------------------------------------------------------------

export function recurrenceOf(days: Weekday[], until: LocalDate | null): Recurrence {
  const byDay = [...new Set(days)].sort((a, b) => a - b) as Weekday[];
  return { freq: byDay.length === 7 ? "DAILY" : "WEEKLY", byDay, until };
}

/**
 * The first date on/after `from` that the session happens on. DTSTART must be
 * a real occurrence — otherwise RFC 5545 counts it as an extra one.
 */
export function firstOccurrenceDate(days: Weekday[], from: LocalDate, until: LocalDate | null): LocalDate | null {
  for (let i = 0; i < 7; i++) {
    const date = addDays(from, i);
    if (until && date > until) return null;
    if (days.includes(weekdayOf(date))) return date;
  }
  return null;
}

/** Local end of an occurrence, correct across midnight and DST changes. */
export function localEnd(date: LocalDate, time: LocalTime, durationMinutes: number, timeZone: string) {
  const end = utcToZoned(zonedToUtc(date, time, timeZone) + durationMinutes * 60_000, timeZone);
  return { date: end.date, time: end.time };
}

// ---------------------------------------------------------------------------
// Building events
// ---------------------------------------------------------------------------

export type BuildOptions = {
  planId: string;
  options: ExportOptions;
  /** Absolute site origin for the "Open in Assume" link. */
  siteUrl: string;
};

export function eventUid(planId: string, sessionId: string) {
  return `${planId}-${sessionId}@assume`;
}

export function includedSessions(doc: Pick<PlanDoc, "sessions">, excluded: string[]): Session[] {
  const skip = new Set(excluded);
  return doc.sessions.filter((s) => !skip.has(s.id));
}

export function buildEvent(session: Session, doc: PlanDoc, { planId, options, siteUrl }: BuildOptions): CalendarEvent | null {
  const timezone = safeTimeZone(doc.timezone);
  const startDate = firstOccurrenceDate(session.days, options.startDate, options.endDate);
  if (!startDate) return null; // no occurrence inside the chosen range

  const prefs = options.preferences;
  const link = prefs.include.link ? planLink(siteUrl, planId) : null;
  const title = titleFor(session, prefs);
  const description = descriptionFor(session, doc, prefs.include, link);
  const recurrence = recurrenceOf(session.days, options.endDate);
  const end = localEnd(startDate, session.startTime, session.durationMinutes, timezone);

  const visible = {
    title,
    description,
    url: link,
    timezone,
    start: { date: startDate, time: session.startTime },
    durationMinutes: session.durationMinutes,
    recurrence,
    reminderMinutes: prefs.reminderMinutes,
  };

  return {
    uid: eventUid(planId, session.id),
    planId,
    sessionId: session.id,
    ...visible,
    end,
    weekdays: recurrence.byDay,
    internal: {
      sessionTitle: session.title,
      technique: session.technique,
      techniqueLabel: techniqueLabel(session),
      instructions: session.instructions,
      optional: session.optional,
    },
    fingerprint: fingerprintOf(visible),
  };
}

export function buildEvents(doc: PlanDoc, opts: BuildOptions): CalendarEvent[] {
  return includedSessions(doc, opts.options.excludedSessionIds)
    .map((s) => buildEvent(s, doc, opts))
    .filter((e): e is CalendarEvent => e !== null)
    .sort((a, b) => (a.start.time === b.start.time ? a.uid.localeCompare(b.uid) : a.start.time.localeCompare(b.start.time)));
}

/**
 * One hash for a whole export. Excludes the start date, so re-opening the
 * export sheet on a later day doesn't make an unchanged routine look edited.
 */
export function exportFingerprint(events: CalendarEvent[]): string {
  return fingerprintOf(
    [...events]
      .sort((a, b) => a.uid.localeCompare(b.uid))
      .map((e) => [e.uid, e.title, e.description, e.timezone, e.start.time, e.durationMinutes, e.recurrence.byDay, e.recurrence.until, e.reminderMinutes]),
  );
}

// ---------------------------------------------------------------------------
// Human-readable summaries (confirmation sheet, plan cards)
// ---------------------------------------------------------------------------

const SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function describeRecurrence(r: Pick<Recurrence, "byDay">): string {
  const key = r.byDay.join(",");
  if (key === "1,2,3,4,5,6,7") return "Every day";
  if (key === "1,2,3,4,5") return "Every weekday";
  if (key === "6,7") return "Every weekend";
  if (r.byDay.length === 1) return `Every ${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][r.byDay[0] - 1]}`;
  return `Every ${r.byDay.map((d) => SHORT_DAYS[d - 1]).join(", ")}`;
}

/** "Repeats every day", "Repeats weekly on some days" — for a whole export. */
export function describeExportRecurrence(events: CalendarEvent[]): string {
  if (!events.length) return "Nothing selected";
  const kinds = new Set(events.map((e) => describeRecurrence(e.recurrence)));
  if (kinds.size === 1) return [...kinds][0];
  return "Weekly, on each session's days";
}

export const titleStyleLabels: Record<TitleStyle, { label: string; example: (sessionTitle: string) => string; hint: string }> = {
  descriptive: { label: "Descriptive", example: (t) => t, hint: "Your session names, as they are in Assume." },
  private: { label: "Private", example: () => PRIVATE_TITLE, hint: "Says what it is, not what it's for." },
  very_private: { label: "Very private", example: () => VERY_PRIVATE_TITLE, hint: "Could be anything." },
  custom: { label: "Custom", example: () => "Your own words", hint: "One title for every event." },
};

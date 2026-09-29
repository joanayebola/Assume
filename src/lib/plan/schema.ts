import { z } from "zod";

import { TECHNIQUES, type Technique, type Weekday } from "@/lib/intake/model";

/**
 * The stored routine document (plans.routine / plan_versions.document).
 *
 * This is the app's own shape — not the model's output. AI output is parsed
 * with src/lib/ai/schema.ts, then converted, normalised and sanity-checked
 * into this document. Derived values (daily minutes, recurrence) are computed
 * from sessions rather than trusted from the model.
 */
export const PLAN_DOC_VERSION = 1;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Use a 24-hour time like 07:30." });
export const weekdaySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]);

export const RECURRENCES = ["daily", "weekdays", "weekends", "custom"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export const sessionSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().trim().min(1, { error: "Give the session a name." }).max(80),
  technique: z.enum(TECHNIQUES),
  /** Shown instead of the technique name when technique = "other". */
  customTechniqueLabel: z.string().max(80),
  days: z.array(weekdaySchema).min(1, { error: "Pick at least one day." }).max(7),
  recurrence: z.enum(RECURRENCES),
  startTime: hhmm,
  durationMinutes: z.number().int().min(1, { error: "At least a minute." }).max(180, { error: "Keep it under 3 hours." }),
  flexibleTiming: z.boolean(),
  /** Nice-to-have sessions (e.g. an optional lunch reset). Not counted in the daily estimate. */
  optional: z.boolean(),
  instructions: z.string().trim().min(1, { error: "Add a short instruction." }).max(1200),
  manifestationId: z.string().nullable(),
  affirmationIds: z.array(z.string()).max(12),
  askfirmationIds: z.array(z.string()).max(12),
  visualizationPrompt: z.string().max(1200),
  scriptingPrompt: z.string().max(1200),
  notes: z.string().max(600),
  /** The everyday activity this rides along with, e.g. "Commute". Empty when none. */
  contextActivity: z.string().max(80),
  /** Why this slot fits the user's schedule. */
  fitReason: z.string().max(400),
  origin: z.enum(["generated", "custom"]),
  /** Set when the user changes a session; adjustments leave these alone by default. */
  userEdited: z.boolean(),
});
export type Session = z.infer<typeof sessionSchema>;

export const libraryItemSchema = z.object({
  id: z.string().min(1).max(40),
  text: z.string().trim().min(1).max(500),
  source: z.enum(["user", "generated", "custom"]),
});
export type LibraryItem = z.infer<typeof libraryItemSchema>;

export const patternSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(60),
  days: z.array(weekdaySchema).min(1).max(7),
  summary: z.string().max(400),
});
export type SchedulePattern = z.infer<typeof patternSchema>;

export const planDocSchema = z.object({
  docVersion: z.literal(PLAN_DOC_VERSION),
  title: z.string().trim().min(1).max(100),
  explanation: z.string().max(800),
  philosophy: z.string().max(1200),
  manifestation: z.object({ id: z.string().nullable(), desire: z.string().max(1000) }),
  timezone: z.string().min(1).max(64),
  affirmations: z.array(libraryItemSchema).max(40),
  askfirmations: z.array(libraryItemSchema).max(20),
  patterns: z.array(patternSchema).max(7),
  sessions: z.array(sessionSchema).max(60),
});
export type PlanDoc = z.infer<typeof planDocSchema>;

// ---------------------------------------------------------------------------
// Derived values
// ---------------------------------------------------------------------------

export function recurrenceFor(days: Weekday[]): Recurrence {
  const key = [...days].sort((a, b) => a - b).join(",");
  if (key === "1,2,3,4,5,6,7") return "daily";
  if (key === "1,2,3,4,5") return "weekdays";
  if (key === "6,7") return "weekends";
  return "custom";
}

/** Minutes of (non-optional) practice per ISO weekday, index 1..7. */
export function minutesByDay(doc: Pick<PlanDoc, "sessions">): Record<Weekday, number> {
  const out = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 } as Record<Weekday, number>;
  for (const s of doc.sessions) {
    if (s.optional) continue;
    for (const d of s.days) out[d] += s.durationMinutes;
  }
  return out;
}

export function dailyMinutesRange(doc: Pick<PlanDoc, "sessions">): { min: number; max: number } {
  const values = Object.values(minutesByDay(doc));
  const active = values.filter((v) => v > 0);
  if (active.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...active), max: Math.max(...active) };
}

export function techniqueName(technique: Technique, customLabel: string, techniqueLabels: Record<Technique, string>) {
  return technique === "other" && customLabel.trim() ? customLabel.trim() : techniqueLabels[technique];
}

let idCounter = 0;
/** Short, URL-safe, collision-resistant ids for sessions/library items. */
export function newId(prefix: "s" | "a" | "q" | "p") {
  idCounter = (idCounter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${rand}`;
}

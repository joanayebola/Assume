import { z } from "zod";

import { emptySections, TECHNIQUES, type IntakeSections } from "./model";

/**
 * Manifestation preferences from Settings, used to prefill new intakes so
 * returning people don't answer the same questions twice. Everything here
 * is optional and editable inside the intake.
 */

const hhmm = z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Use a time like 07:30." })]);

export const intakeDefaultsSchema = z
  .object({
    wakeTime: hhmm,
    sleepTime: hhmm,
    loved: z.array(z.enum(TECHNIQUES)).max(TECHNIQUES.length),
    avoided: z.array(z.enum(TECHNIQUES)).max(TECHNIQUES.length),
    // "custom" needs a written note / minutes, so it isn't offered as a default.
    style: z.enum(["light", "balanced", "structured", "hourly"]).nullable(),
    timeBudget: z.enum(["5_10", "15_30", "30_60", "60_plus"]).nullable(),
  })
  .refine((d) => !d.loved.some((t) => d.avoided.includes(t)), { error: "A technique can't be both loved and avoided." });

export type IntakeDefaults = z.infer<typeof intakeDefaultsSchema>;

export const EMPTY_INTAKE_DEFAULTS: IntakeDefaults = { wakeTime: "", sleepTime: "", loved: [], avoided: [], style: null, timeBudget: null };

export function parseIntakeDefaults(raw: unknown): IntakeDefaults {
  const parsed = intakeDefaultsSchema.safeParse(raw);
  return parsed.success ? parsed.data : EMPTY_INTAKE_DEFAULTS;
}

export function hasDefaults(d: IntakeDefaults) {
  return Boolean(d.wakeTime || d.sleepTime || d.loved.length || d.avoided.length || d.style || d.timeBudget);
}

/** The sections a new intake starts with, given someone's defaults. */
export function prefilledSections(d: IntakeDefaults): Partial<Pick<IntakeSections, "day" | "methods" | "intensity">> {
  const empty = emptySections();
  const out: Partial<Pick<IntakeSections, "day" | "methods" | "intensity">> = {};
  if (d.wakeTime || d.sleepTime) out.day = { ...empty.day, wakeTime: d.wakeTime, sleepTime: d.sleepTime };
  if (d.loved.length || d.avoided.length) {
    out.methods = {
      ...empty.methods,
      preferences: [
        ...d.loved.map((technique) => ({ technique, preference: "love" as const })),
        ...d.avoided.map((technique) => ({ technique, preference: "avoid" as const })),
      ],
    };
  }
  if (d.style || d.timeBudget) out.intensity = { ...empty.intensity, style: d.style, timeBudget: d.timeBudget };
  return out;
}

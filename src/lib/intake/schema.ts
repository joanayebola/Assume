import { z } from "zod";

import {
  AFFIRMATION_MODES,
  COMMITMENT_KINDS,
  OVERLAP_OPTIONS,
  OVERLAP_TECHNIQUES,
  ROUTINE_STYLES,
  SECTION_KEYS,
  TECHNIQUE_PREFERENCES,
  TECHNIQUES,
  TIME_BUDGETS,
  type IntakeSections,
  type SectionKey,
} from "./model";

/**
 * Two layers of validation:
 *
 *  1. `sectionSchemas` — lenient. Used for every autosave: checks shape and
 *     limits only, so half-finished answers can always be saved.
 *  2. `completionIssues` — the rules for moving on / submitting. Run on the
 *     client when the user presses Continue and on the server at submit.
 */

const time = z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]);
const date = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
const text = (max: number) => z.string().max(max, { error: `Keep this under ${max.toLocaleString()} characters.` });

export const desireSchema = z.object({
  desire: text(1000),
  desiredEnd: text(4000),
  circumstances: text(4000),
});

export const affirmationsSchema = z.object({
  mode: z.enum(AFFIRMATION_MODES).nullable(),
  items: z
    .array(z.object({ id: z.string().max(64), text: text(500) }))
    .max(30, { error: "That's plenty — 30 affirmations is the limit." }),
});

export const methodsSchema = z.object({
  unsure: z.boolean(),
  preferences: z
    .array(z.object({ technique: z.enum(TECHNIQUES), preference: z.enum(TECHNIQUE_PREFERENCES) }))
    .max(TECHNIQUES.length),
  otherLabel: text(80),
});

export const commitmentSchema = z.object({
  id: z.string().max(64),
  kind: z.enum(COMMITMENT_KINDS),
  label: text(80),
  weekdays: z.array(z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)])).max(7),
  start: time,
  end: time,
  overlap: z.enum(OVERLAP_OPTIONS).nullable(),
  overlapTechniques: z.array(z.enum(OVERLAP_TECHNIQUES)).max(OVERLAP_TECHNIQUES.length),
  overlapOtherLabel: text(80),
});

export const daySchema = z.object({
  wakeTime: time,
  sleepTime: time,
  typicalDay: text(4000),
  commitments: z.array(commitmentSchema).max(20, { error: "Up to 20 commitments." }),
  weekendsDifferent: z.boolean().nullable(),
  weekendDescription: text(2000),
});

export const intensitySchema = z.object({
  timeBudget: z.enum(TIME_BUDGETS).nullable(),
  customMinutes: z.number().int().min(1).max(600).nullable(),
  style: z.enum(ROUTINE_STYLES).nullable(),
  styleNote: text(1000),
  quietTimes: text(1000),
});

export const contextSchema = z.object({
  hasRelevantDate: z.boolean().nullable(),
  relevantDate: date,
  notes: text(4000),
});

export const sectionSchemas = {
  desire: desireSchema,
  affirmations: affirmationsSchema,
  methods: methodsSchema,
  day: daySchema,
  intensity: intensitySchema,
  context: contextSchema,
} satisfies { [K in SectionKey]: z.ZodType<IntakeSections[K]> };

export function parseSection<K extends SectionKey>(key: K, data: unknown) {
  return (sectionSchemas[key] as unknown as z.ZodType<IntakeSections[K]>).safeParse(data);
}

/** Field path (e.g. "items.2.text") → message. */
export type Issues = Record<string, string>;

export function issuesFromZod(error: z.ZodError): Issues {
  const out: Issues = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * What must be answered before leaving a step. Kept deliberately small:
 * optional questions stay optional.
 */
export function completionIssues<K extends SectionKey>(key: K, data: IntakeSections[K]): Issues {
  const parsed = parseSection(key, data);
  if (!parsed.success) return issuesFromZod(parsed.error);

  const issues: Issues = {};
  switch (key) {
    case "desire": {
      const d = data as IntakeSections["desire"];
      if (!d.desire.trim()) issues.desire = "Tell us what you're manifesting — a few words is enough.";
      break;
    }
    case "affirmations": {
      const d = data as IntakeSections["affirmations"];
      if (!d.mode) issues.mode = "Choose one of the options to continue.";
      if (d.mode === "own" && !d.items.some((i) => i.text.trim())) {
        issues.items = "Add at least one affirmation, or choose another option.";
      }
      break;
    }
    case "methods": {
      const d = data as IntakeSections["methods"];
      if (!d.unsure && d.preferences.length === 0) {
        issues.preferences = "Mark at least one method, or choose “I'm not sure”.";
      }
      if (d.preferences.some((p) => p.technique === "other") && !d.otherLabel.trim()) {
        issues.otherLabel = "What's the other method called?";
      }
      break;
    }
    case "day": {
      const d = data as IntakeSections["day"];
      if (!d.wakeTime) issues.wakeTime = "Add roughly when you wake up.";
      if (!d.sleepTime) issues.sleepTime = "Add roughly when you go to sleep.";
      if (!d.typicalDay.trim() && d.commitments.length === 0) {
        issues.typicalDay = "Describe your day in a sentence or two, or add a commitment below.";
      }
      d.commitments.forEach((c, i) => {
        if (!c.label.trim()) issues[`commitments.${i}.label`] = "Give this a name.";
        if (c.weekdays.length === 0) issues[`commitments.${i}.weekdays`] = "Pick at least one day.";
        if (!c.overlap) issues[`commitments.${i}.overlap`] = "Let us know whether you could manifest during this.";
        if (c.overlap === "some" && c.overlapTechniques.length === 0) {
          issues[`commitments.${i}.overlapTechniques`] = "Pick what would work, or choose Yes or No.";
        }
      });
      if (d.weekendsDifferent === true && !d.weekendDescription.trim()) {
        issues.weekendDescription = "Tell us a little about your weekends.";
      }
      break;
    }
    case "intensity": {
      const d = data as IntakeSections["intensity"];
      if (!d.timeBudget) issues.timeBudget = "Choose how much time feels right.";
      if (d.timeBudget === "custom" && !d.customMinutes) issues.customMinutes = "How many minutes a day?";
      if (!d.style) issues.style = "Choose a routine style.";
      if (d.style === "custom" && !d.styleNote.trim()) issues.styleNote = "Tell us what you have in mind.";
      break;
    }
    case "context": {
      const d = data as IntakeSections["context"];
      if (d.hasRelevantDate === null) issues.hasRelevantDate = "Choose yes or no.";
      if (d.hasRelevantDate && !d.relevantDate) issues.relevantDate = "Pick the date.";
      break;
    }
  }
  return issues;
}

export function isSectionComplete<K extends SectionKey>(key: K, data: IntakeSections[K]) {
  return Object.keys(completionIssues(key, data)).length === 0;
}

export function firstIncompleteSection(sections: IntakeSections): SectionKey | null {
  for (const key of SECTION_KEYS) {
    if (!isSectionComplete(key, sections[key])) return key;
  }
  return null;
}

import { z } from "zod";

import { TECHNIQUES } from "@/lib/intake/model";

/**
 * The exact JSON the model must return. Deliberately flat and null-free
 * (empty strings / empty arrays mean "not applicable") so it maps cleanly to
 * the JSON Schema subset Gemini supports, and so the app never parses prose.
 */

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .describe("24-hour local time, HH:MM.");

export const aiSessionSchema = z.object({
  title: z.string().min(1).max(80).describe("Short, specific name, e.g. 'Commute affirmations'."),
  technique: z.enum(TECHNIQUES),
  customTechniqueLabel: z.string().max(80).describe("Only when technique is 'other'; otherwise empty."),
  days: z
    .array(z.number().int().min(1).max(7))
    .min(1)
    .max(7)
    .describe("ISO weekdays this session repeats on (1–7 entries): 1 = Monday … 7 = Sunday."),
  startTime: time,
  durationMinutes: z.number().int().min(1).max(180),
  flexibleTiming: z.boolean().describe("True when the exact time can move within its window."),
  optional: z.boolean().describe("True for nice-to-have extras that don't count toward the daily time."),
  recurrenceLabel: z.string().max(60).describe("Human label for the repeat pattern, e.g. 'Gym days'."),
  instructions: z.string().min(1).max(1200).describe("What to do, in 1–4 plain sentences."),
  affirmations: z
    .array(z.string().min(1).max(500))
    .max(12)
    .describe("Affirmation texts used in this session (the user's own first; at most 12). Empty if not an affirmation session."),
  askfirmations: z.array(z.string().min(1).max(300)).max(12).describe("Questions, each ending with '?' (at most 12). Empty if unused."),
  visualizationPrompt: z.string().max(1200).describe("Scene to imagine for visualization, SATS or revision. Empty otherwise."),
  scriptingPrompt: z.string().max(1200).describe("Writing prompt for scripting. Empty otherwise."),
  notes: z.string().max(600),
  contextActivity: z.string().max(80).describe("The activity this rides along with (e.g. 'Commute'), or empty."),
  fitReason: z.string().min(1).max(400).describe("Why this slot fits this person's schedule."),
});
export type AISession = z.infer<typeof aiSessionSchema>;

export const aiPatternSchema = z.object({
  label: z.string().min(1).max(60).describe("e.g. 'Workdays', 'Gym days', 'Weekends', 'Shift nights'."),
  days: z.array(z.number().int().min(1).max(7)).min(1).max(7).describe("ISO weekdays, 1–7 entries."),
  summary: z.string().max(400).describe("One sentence on how practice works on these days."),
});

export const aiPlanSchema = z.object({
  title: z.string().min(1).max(100),
  explanation: z.string().min(1).max(800).describe("2–3 sentences, personal: why this routine suits their life."),
  philosophy: z.string().min(1).max(1200).describe("Short, gentle framing of how to use the routine."),
  generatedAffirmations: z
    .array(z.string().min(1).max(500))
    .max(8)
    .describe("New affirmations written for this person (at most 8). Empty unless they asked for help writing some."),
  generatedAskfirmations: z.array(z.string().min(1).max(300)).max(6).describe("At most 6 questions."),
  patterns: z.array(aiPatternSchema).min(1).max(7).describe("1–7 patterns."),
  sessions: z.array(aiSessionSchema).min(1).max(40).describe("1–40 sessions."),
});
export type AIPlan = z.infer<typeof aiPlanSchema>;

// ---------------------------------------------------------------------------
// JSON Schema for the Gemini API
// ---------------------------------------------------------------------------

/**
 * Keywords sent to Gemini's structured-output JSON Schema.
 *
 * `minItems`/`maxItems` are documented as supported, but live testing
 * (2026-09, gemini-3.7/3.8-flash) returned 400 INVALID_ARGUMENT for this
 * schema whenever they were present, so they are dropped here. Array limits
 * are stated in field descriptions instead and still enforced by Zod.
 */
const SUPPORTED = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "enum",
  "format",
  "minimum",
  "maximum",
  "items",
  "prefixItems",
  "title",
  "description",
  "anyOf",
]);

/**
 * Converts a Zod schema to the JSON Schema subset Gemini supports.
 * Unsupported keywords (pattern, minLength, $schema…) are dropped — Zod
 * still enforces them when the response is parsed.
 */
export function toGeminiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { target: "draft-2020-12", io: "output", unrepresentable: "any" });
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (!SUPPORTED.has(key)) continue;
      if (key === "properties" && value && typeof value === "object") {
        out.properties = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]));
      } else {
        out[key] = clean(value);
      }
    }
    return out;
  };
  return clean(raw) as Record<string, unknown>;
}

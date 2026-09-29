import type { IntakeSnapshotV2 } from "@/lib/intake/snapshot";
import type { PlanDoc } from "@/lib/plan/schema";

/**
 * Quiet care for serious circumstances.
 *
 * Assume is a manifestation planner, not a warning screen. But when someone
 * mentions health, legal, safety or pressing money matters, the routine must
 * sit *alongside* real-world help and action — never in place of it. We
 * detect those themes on the server (nothing leaves this module), tell the
 * model, and make sure the plan's "How to use this" note carries one gentle
 * sentence if the model didn't write one itself.
 */

export type CareTheme = "health" | "legal" | "safety" | "financial";

const THEMES: Record<CareTheme, RegExp> = {
  health:
    /\b(diagnos\w*|cancer|tumou?r|surgery|operation|chemo\w*|illness|disease|sick|symptoms?|pain|pregnan\w*|fertility|ivf|miscarriage|medication|medicine|hospital|doctor|therapy|therapist|depress\w*|anxiety|suicid\w*|self[- ]harm|eating disorder|addiction|recovery|heal(ing|th)?)\b/i,
  legal: /\b(court|lawsuit|sued?|custody|divorce|lawyer|attorney|solicitor|visa|immigration|deport\w*|asylum|eviction|arrest\w*|charges|trial|probation|legal)\b/i,
  safety: /\b(abus\w*|violen\w*|unsafe|danger\w*|threat\w*|stalk\w*|harass\w*|restraining order|domestic)\b/i,
  financial: /\b(debt|bankrupt\w*|evict\w*|rent (is )?(due|late)|foreclos\w*|can'?t afford|behind on|overdue bills?|loan shark)\b/i,
};

export function careThemes(s: IntakeSnapshotV2): CareTheme[] {
  const text = [s.manifestation.desire, s.manifestation.desiredEnd, s.manifestation.circumstances, s.notes]
    .filter((t): t is string => typeof t === "string")
    .join("\n");
  return (Object.keys(THEMES) as CareTheme[]).filter((k) => THEMES[k].test(text));
}

/** Instruction for the model when themes are present (no user text is echoed). */
export function careGuidance(themes: CareTheme[]): string | null {
  if (!themes.length) return null;
  const areas = themes.map((t) => ({ health: "health", legal: "legal matters", safety: "personal safety", financial: "money pressures" })[t]);
  return (
    `Their circumstances touch on ${areas.join(", ")}. Keep the routine supportive of the practical side: the practice sits alongside ` +
    "appropriate professional help and real-world action, never in place of it. Say this once, gently and briefly, in 'philosophy'. " +
    "No warnings, disclaimers, lists or diagnosis."
  );
}

const SENTENCES: Record<CareTheme, string> = {
  safety: "If you're ever unsafe, reach out to emergency services or someone you trust first — this practice can wait.",
  health: "Keep leaning on the care and advice of the professionals you trust; this practice sits alongside that, never instead of it.",
  legal: "Keep taking the practical steps and advice your situation calls for; this practice sits alongside them.",
  financial: "Keep taking the practical steps your situation calls for; this practice sits alongside them.",
};

/** Already says something like this? Then leave the model's wording alone. */
const MENTIONS_REAL_WORLD = /\b(professional|doctor|advice|emergency|lawyer|practical steps?|alongside|real[- ]world|support you trust|care team)\b/i;

export function ensureCareNote(doc: PlanDoc, themes: CareTheme[]): PlanDoc {
  if (!themes.length || MENTIONS_REAL_WORLD.test(doc.philosophy)) return doc;
  // Most pressing first; one sentence only.
  const theme = (["safety", "health", "legal", "financial"] as const).find((t) => themes.includes(t))!;
  const philosophy = [doc.philosophy.trim(), SENTENCES[theme]].filter(Boolean).join(" ").slice(0, 1200);
  return { ...doc, philosophy };
}

import type { Weekday } from "@/lib/intake/model";
import type { IntakeSnapshotV2 } from "@/lib/intake/snapshot";
import type { AIPlan, AISession } from "@/lib/ai/schema";

import {
  PLAN_DOC_VERSION,
  newId,
  recurrenceFor,
  type LibraryItem,
  type PlanDoc,
  type Session,
} from "./schema";
import { toMinutes } from "./time";

/**
 * Converts validated model output into the app's PlanDoc: assigns ids, links
 * affirmation/askfirmation texts to library items (reusing the user's own
 * wording), derives recurrence, and merges any fixed (user-edited) sessions.
 */

const norm = (t: string) => t.trim().replace(/\s+/g, " ").toLowerCase();

function ensureQuestion(t: string) {
  const s = t.trim();
  return /[?？]$/.test(s) ? s : `${s.replace(/[.!]+$/, "")}?`;
}

export function cleanDays(days: number[]): Weekday[] {
  return [...new Set(days.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b) as Weekday[];
}

class Library {
  items: LibraryItem[];
  private byText = new Map<string, string>();
  constructor(
    private prefix: "a" | "q",
    initial: LibraryItem[],
  ) {
    this.items = [...initial];
    for (const i of initial) this.byText.set(norm(i.text), i.id);
  }
  idFor(text: string, source: LibraryItem["source"]) {
    const clean = this.prefix === "q" ? ensureQuestion(text) : text.trim().replace(/\s+/g, " ");
    if (!clean) return null;
    const existing = this.byText.get(norm(clean));
    if (existing) return existing;
    const id = newId(this.prefix);
    this.items.push({ id, text: clean, source });
    this.byText.set(norm(clean), id);
    return id;
  }
}

export function sessionFromAI(
  ai: AISession,
  ctx: { manifestationId: string | null; affirmations: Library; askfirmations: Library; id?: string },
): Session {
  const days = cleanDays(ai.days);
  return {
    id: ctx.id ?? newId("s"),
    title: ai.title.trim(),
    technique: ai.technique,
    customTechniqueLabel: ai.technique === "other" ? ai.customTechniqueLabel.trim() : "",
    days,
    recurrence: recurrenceFor(days),
    startTime: ai.startTime,
    durationMinutes: Math.round(ai.durationMinutes),
    flexibleTiming: ai.flexibleTiming,
    optional: ai.optional,
    instructions: ai.instructions.trim(),
    manifestationId: ctx.manifestationId,
    affirmationIds: ai.affirmations
      .map((t) => ctx.affirmations.idFor(t, "generated"))
      .filter((x): x is string => Boolean(x)),
    askfirmationIds: ai.askfirmations
      .map((t) => ctx.askfirmations.idFor(t, "generated"))
      .filter((x): x is string => Boolean(x)),
    visualizationPrompt: ai.visualizationPrompt.trim(),
    scriptingPrompt: ai.scriptingPrompt.trim(),
    notes: ai.notes.trim(),
    contextActivity: ai.contextActivity.trim(),
    fitReason: ai.fitReason.trim(),
    origin: "generated",
    userEdited: false,
  };
}

export function sortSessions(sessions: Session[]) {
  return [...sessions].sort(
    (a, b) => toMinutes(a.startTime) - toMinutes(b.startTime) || a.days[0] - b.days[0] || a.title.localeCompare(b.title),
  );
}

export type BuildContext = {
  snapshot: IntakeSnapshotV2;
  manifestationId: string | null;
  /** When adjusting: the current plan (its library and pinned sessions are kept). */
  base?: PlanDoc;
  pinned?: Session[];
};

export function planDocFromAI(ai: AIPlan, ctx: BuildContext): PlanDoc {
  const s = ctx.snapshot;
  const userAffirmations: LibraryItem[] =
    s.affirmations.mode === "own" ? s.affirmations.items.map((text) => ({ id: newId("a"), text, source: "user" })) : [];

  const affirmations = new Library("a", ctx.base ? ctx.base.affirmations : userAffirmations);
  const askfirmations = new Library("q", ctx.base ? ctx.base.askfirmations : []);

  if (s.affirmations.mode !== "none") {
    for (const t of ai.generatedAffirmations.slice(0, 8)) affirmations.idFor(t, "generated");
  }
  for (const t of ai.generatedAskfirmations.slice(0, 6)) askfirmations.idFor(t, "generated");

  const generated = ai.sessions.map((x) =>
    sessionFromAI(x, { manifestationId: ctx.manifestationId, affirmations, askfirmations }),
  );

  const doc: PlanDoc = {
    docVersion: PLAN_DOC_VERSION,
    title: ai.title.trim(),
    explanation: ai.explanation.trim(),
    philosophy: ai.philosophy.trim(),
    manifestation: { id: ctx.manifestationId, desire: s.manifestation.desire },
    timezone: s.timezone,
    affirmations: affirmations.items,
    askfirmations: askfirmations.items,
    patterns: ai.patterns.map((p) => ({
      id: newId("p"),
      label: p.label.trim(),
      days: cleanDays(p.days).length ? cleanDays(p.days) : [1, 2, 3, 4, 5, 6, 7],
      summary: p.summary.trim(),
    })),
    sessions: sortSessions([...(ctx.pinned ?? []), ...generated]),
  };
  return pruneLibrary(doc);
}

/** Replace one session in place, keeping its id and position in the schedule. */
export function replaceSessionFromAI(doc: PlanDoc, targetId: string, ai: AISession): PlanDoc {
  const affirmations = new Library("a", doc.affirmations);
  const askfirmations = new Library("q", doc.askfirmations);
  const target = doc.sessions.find((x) => x.id === targetId);
  if (!target) return doc;
  const next = sessionFromAI(ai, {
    id: targetId,
    manifestationId: target.manifestationId,
    affirmations,
    askfirmations,
  });
  return pruneLibrary({
    ...doc,
    affirmations: affirmations.items,
    askfirmations: askfirmations.items,
    sessions: sortSessions(doc.sessions.map((x) => (x.id === targetId ? next : x))),
  });
}

/**
 * Enforce library size limits. Items are never silently dropped otherwise:
 * generated affirmations stay available even if no session uses them yet.
 */
export function pruneLibrary(doc: PlanDoc): PlanDoc {
  return { ...doc, affirmations: doc.affirmations.slice(0, 40), askfirmations: doc.askfirmations.slice(0, 20) };
}

import type { IntakeSnapshotV2 } from "@/lib/intake/snapshot";
import { PLAN_DOC_VERSION, recurrenceFor, type LibraryItem, type PlanDoc, type Session } from "@/lib/plan/schema";

let n = 0;

export function session(overrides: Partial<Session> = {}): Session {
  const days = overrides.days ?? [1, 2, 3, 4, 5, 6, 7];
  return {
    id: overrides.id ?? `s_test_${++n}`,
    title: "Session",
    technique: "visualization",
    customTechniqueLabel: "",
    days,
    recurrence: recurrenceFor(days),
    startTime: "07:15",
    durationMinutes: 5,
    flexibleTiming: true,
    optional: false,
    instructions: "Do the thing gently.",
    manifestationId: null,
    affirmationIds: [],
    askfirmationIds: [],
    visualizationPrompt: "A calm scene from the end.",
    scriptingPrompt: "",
    notes: "",
    contextActivity: "",
    fitReason: "It fits.",
    origin: "generated",
    userEdited: false,
    ...overrides,
  };
}

export function planDoc(s: IntakeSnapshotV2, sessions: Session[], extra: Partial<PlanDoc> = {}): PlanDoc {
  const affirmations: LibraryItem[] =
    s.affirmations.mode === "own" ? s.affirmations.items.map((text, i) => ({ id: `a_user_${i}`, text, source: "user" })) : [];
  return {
    docVersion: PLAN_DOC_VERSION,
    title: "Test plan",
    explanation: "A plan.",
    philosophy: "Tools, not tests.",
    manifestation: { id: null, desire: s.manifestation.desire },
    timezone: s.timezone,
    affirmations,
    askfirmations: [],
    patterns: [{ id: "p_1", label: "Every day", days: [1, 2, 3, 4, 5, 6, 7], summary: "" }],
    sessions,
    ...extra,
  };
}

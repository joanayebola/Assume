/**
 * The intake domain model shared by the wizard (client), the server actions
 * and both repository implementations. Enum values mirror the Postgres enums
 * in supabase/migrations/20260929000000_manifestation_intake.sql.
 */

export const STEP_KEYS = ["desire", "affirmations", "methods", "day", "intensity", "context", "review"] as const;
export type StepKey = (typeof STEP_KEYS)[number];

/** Steps that hold data (review has none). */
export const SECTION_KEYS = ["desire", "affirmations", "methods", "day", "intensity", "context"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const AFFIRMATION_MODES = ["own", "generate", "none"] as const;
export type AffirmationMode = (typeof AFFIRMATION_MODES)[number];

export const TECHNIQUES = [
  "affirmations",
  "askfirmations",
  "visualization",
  "sats",
  "scripting",
  "subliminals",
  "inner_conversations",
  "revision",
  "meditation",
  "other",
] as const;
export type Technique = (typeof TECHNIQUES)[number];

export const TECHNIQUE_PREFERENCES = ["love", "fine", "avoid"] as const;
export type TechniquePreference = (typeof TECHNIQUE_PREFERENCES)[number];

export const COMMITMENT_KINDS = ["work", "school", "commute", "gym", "class", "childcare", "other"] as const;
export type CommitmentKind = (typeof COMMITMENT_KINDS)[number];

export const TIME_BUDGETS = ["5_10", "15_30", "30_60", "60_plus", "custom"] as const;
export type TimeBudget = (typeof TIME_BUDGETS)[number];

export const ROUTINE_STYLES = ["light", "balanced", "structured", "hourly", "custom"] as const;
export type RoutineStyle = (typeof ROUTINE_STYLES)[number];

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type AffirmationItem = { id: string; text: string };

/**
 * Whether manifestation can overlap with an activity. Activities are context,
 * not blocked time: a commute or gym session is often an ideal window.
 */
export const OVERLAP_OPTIONS = ["yes", "some", "no"] as const;
export type Overlap = (typeof OVERLAP_OPTIONS)[number];

/** Techniques offered when an activity allows "some" overlap. */
export const OVERLAP_TECHNIQUES = [
  "affirmations",
  "askfirmations",
  "subliminals",
  "visualization",
  "scripting",
  "inner_conversations",
  "other",
] as const satisfies readonly Technique[];
export type OverlapTechnique = (typeof OVERLAP_TECHNIQUES)[number];

export type Commitment = {
  id: string;
  kind: CommitmentKind;
  label: string;
  weekdays: Weekday[];
  start: string; // "HH:MM" or ""
  end: string; // "HH:MM" or ""
  /** null = not answered yet. */
  overlap: Overlap | null;
  /** Only meaningful when overlap = "some". */
  overlapTechniques: OverlapTechnique[];
  overlapOtherLabel: string;
};

export type TechniqueChoice = { technique: Technique; preference: TechniquePreference };

export type DesireSection = {
  desire: string;
  desiredEnd: string;
  circumstances: string;
};

export type AffirmationsSection = {
  mode: AffirmationMode | null;
  items: AffirmationItem[];
};

export type MethodsSection = {
  unsure: boolean;
  preferences: TechniqueChoice[];
  otherLabel: string;
};

export type DaySection = {
  wakeTime: string; // "HH:MM" or ""
  sleepTime: string;
  typicalDay: string;
  commitments: Commitment[];
  weekendsDifferent: boolean | null;
  weekendDescription: string;
};

export type IntensitySection = {
  timeBudget: TimeBudget | null;
  customMinutes: number | null;
  style: RoutineStyle | null;
  styleNote: string;
  quietTimes: string;
};

export type ContextSection = {
  hasRelevantDate: boolean | null;
  relevantDate: string; // "YYYY-MM-DD" or ""
  notes: string;
};

export type IntakeSections = {
  desire: DesireSection;
  affirmations: AffirmationsSection;
  methods: MethodsSection;
  day: DaySection;
  intensity: IntensitySection;
  context: ContextSection;
};

export type IntakeStatus = "in_progress" | "submitted" | "archived";

export type IntakeDraft = IntakeSections & {
  id: string;
  status: IntakeStatus;
  currentStep: StepKey;
  completedSteps: StepKey[];
  updatedAt: string;
  /** Set once submitted. */
  requestId: string | null;
};

export type IntakeSummary = {
  id: string;
  title: string | null;
  currentStep: StepKey;
  completedCount: number;
  updatedAt: string;
};

export type GenerationStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export type GenerationRequestSummary = {
  id: string;
  intakeId: string;
  title: string;
  status: GenerationStatus;
  planId: string | null;
  createdAt: string;
};

export function emptySections(): IntakeSections {
  return {
    desire: { desire: "", desiredEnd: "", circumstances: "" },
    affirmations: { mode: null, items: [] },
    methods: { unsure: false, preferences: [], otherLabel: "" },
    day: {
      wakeTime: "",
      sleepTime: "",
      typicalDay: "",
      commitments: [],
      weekendsDifferent: null,
      weekendDescription: "",
    },
    intensity: { timeBudget: null, customMinutes: null, style: null, styleNote: "", quietTimes: "" },
    context: { hasRelevantDate: null, relevantDate: "", notes: "" },
  };
}

export function titleFromDesire(desire: string): string | null {
  const t = desire.trim().replace(/\s+/g, " ");
  if (!t) return null;
  return t.length > 160 ? `${t.slice(0, 157)}…` : t;
}

export function isStepKey(value: unknown): value is StepKey {
  return typeof value === "string" && (STEP_KEYS as readonly string[]).includes(value);
}

/** Fills fields added after a draft was first saved (e.g. overlap, added in schema v2). */
export function normalizeCommitment(c: Partial<Commitment> & Pick<Commitment, "id" | "kind">): Commitment {
  return {
    id: c.id,
    kind: c.kind,
    label: c.label ?? "",
    weekdays: c.weekdays ?? [],
    start: c.start ?? "",
    end: c.end ?? "",
    overlap: c.overlap ?? null,
    overlapTechniques: c.overlapTechniques ?? [],
    overlapOtherLabel: c.overlapOtherLabel ?? "",
  };
}

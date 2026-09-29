import type {
  AffirmationMode,
  CommitmentKind,
  IntakeSections,
  Overlap,
  OverlapTechnique,
  RoutineStyle,
  Technique,
  TimeBudget,
  Weekday,
} from "./model";

/**
 * The frozen, normalised input handed to routine generation (Phase 3).
 * Stored in plan_generation_requests.input_snapshot. Bump SNAPSHOT_VERSION
 * whenever the shape changes so the generator can handle old requests.
 */
export const SNAPSHOT_VERSION = 2;

/**
 * v2 (current): schedule commitments carry `manifestationOverlap` — activities
 * are context, not blocked time.
 * v1: commitments had no overlap information (kind/label/days/times only).
 */
export type IntakeSnapshotV2 = {
  version: 2;
  submittedAt: string;
  timezone: string;
  manifestation: {
    desire: string;
    desiredEnd: string | null;
    circumstances: string | null;
    relevantDate: string | null;
  };
  affirmations: {
    mode: AffirmationMode;
    /** Present when mode = "own". */
    items: string[];
  };
  techniques: {
    /** User asked Assume to suggest what fits. */
    suggestForMe: boolean;
    love: Technique[];
    fine: Technique[];
    avoid: Technique[];
    otherLabel: string | null;
  };
  schedule: {
    wakeTime: string;
    sleepTime: string;
    typicalDay: string | null;
    weekendsDifferent: boolean;
    weekendDescription: string | null;
    commitments: {
      kind: CommitmentKind;
      label: string;
      weekdays: Weekday[];
      start: string | null;
      end: string | null;
      /**
       * Could the user comfortably manifest during this activity?
       *  - "yes": any technique that suits the moment
       *  - "some": only `techniques` (plus `otherLabel` if "other" is listed)
       *  - "no": don't schedule practice during it
       */
      manifestationOverlap: {
        availability: Overlap;
        techniques: OverlapTechnique[];
        otherLabel: string | null;
      };
    }[];
  };
  intensity: {
    timeBudget: TimeBudget;
    /** Minutes per day: [min, max]. Custom budgets have min = max. */
    minutesPerDay: [number, number | null];
    style: RoutineStyle;
    styleNote: string | null;
    quietTimes: string | null;
  };
  notes: string | null;
};

const budgetRange: Record<Exclude<TimeBudget, "custom">, [number, number | null]> = {
  "5_10": [5, 10],
  "15_30": [15, 30],
  "30_60": [30, 60],
  "60_plus": [60, null],
};

const orNull = (s: string) => (s.trim() ? s.trim() : null);

/** Assumes every section has passed completionIssues(). */
export function buildSnapshot(s: IntakeSections, opts: { timezone: string; submittedAt: Date }): IntakeSnapshotV2 {
  const byPref = (p: "love" | "fine" | "avoid") =>
    s.methods.preferences.filter((x) => x.preference === p).map((x) => x.technique);

  const mode = s.affirmations.mode ?? "none";
  const budget = s.intensity.timeBudget ?? "15_30";

  return {
    version: 2,
    submittedAt: opts.submittedAt.toISOString(),
    timezone: opts.timezone,
    manifestation: {
      desire: s.desire.desire.trim(),
      desiredEnd: orNull(s.desire.desiredEnd),
      circumstances: orNull(s.desire.circumstances),
      relevantDate: s.context.hasRelevantDate && s.context.relevantDate ? s.context.relevantDate : null,
    },
    affirmations: {
      mode,
      items: mode === "own" ? s.affirmations.items.map((i) => i.text.trim()).filter(Boolean) : [],
    },
    techniques: {
      suggestForMe: s.methods.unsure,
      love: byPref("love"),
      fine: byPref("fine"),
      avoid: byPref("avoid"),
      otherLabel: s.methods.preferences.some((p) => p.technique === "other") ? orNull(s.methods.otherLabel) : null,
    },
    schedule: {
      wakeTime: s.day.wakeTime,
      sleepTime: s.day.sleepTime,
      typicalDay: orNull(s.day.typicalDay),
      weekendsDifferent: s.day.weekendsDifferent === true,
      weekendDescription: s.day.weekendsDifferent ? orNull(s.day.weekendDescription) : null,
      commitments: s.day.commitments.map((c) => ({
        kind: c.kind,
        label: c.label.trim(),
        weekdays: [...c.weekdays].sort(),
        start: c.start || null,
        end: c.end || null,
        manifestationOverlap: {
          availability: c.overlap ?? "no",
          techniques: c.overlap === "some" ? c.overlapTechniques : [],
          otherLabel: c.overlap === "some" && c.overlapTechniques.includes("other") ? orNull(c.overlapOtherLabel) : null,
        },
      })),
    },
    intensity: {
      timeBudget: budget,
      minutesPerDay:
        budget === "custom" ? [s.intensity.customMinutes ?? 15, s.intensity.customMinutes ?? 15] : budgetRange[budget],
      style: s.intensity.style ?? "balanced",
      styleNote: s.intensity.style === "custom" ? orNull(s.intensity.styleNote) : null,
      quietTimes: orNull(s.intensity.quietTimes),
    },
    notes: orNull(s.context.notes),
  };
}

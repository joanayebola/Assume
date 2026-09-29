import type { IntakeSnapshotV2 } from "@/lib/intake/snapshot";

/**
 * Radically different people. Used by the offline suite (checks + local
 * generator + pipeline) and by the live Gemini evaluation.
 */

type Commitment = IntakeSnapshotV2["schedule"]["commitments"][number];

const commitment = (c: Partial<Commitment> & Pick<Commitment, "kind" | "label" | "weekdays">): Commitment => ({
  start: null,
  end: null,
  manifestationOverlap: { availability: "no", techniques: [], otherLabel: null },
  ...c,
});

function base(overrides: Partial<IntakeSnapshotV2>): IntakeSnapshotV2 {
  return {
    version: 2,
    submittedAt: "2026-09-28T09:00:00.000Z",
    timezone: "Europe/London",
    manifestation: { desire: "My dream apartment", desiredEnd: null, circumstances: null, relevantDate: null },
    affirmations: { mode: "generate", items: [] },
    techniques: { suggestForMe: false, love: ["visualization"], fine: [], avoid: [], otherLabel: null },
    schedule: {
      wakeTime: "07:00",
      sleepTime: "23:00",
      typicalDay: null,
      weekendsDifferent: false,
      weekendDescription: null,
      commitments: [],
    },
    intensity: { timeBudget: "15_30", minutesPerDay: [15, 30], style: "balanced", styleNote: null, quietTimes: null },
    notes: null,
    ...overrides,
  };
}

/** The Phase 3 brief's example: 9–5, commute, gym MWF, loves affirmations + SATS, hates scripting. */
export const officeWorker = base({
  manifestation: {
    desire: "A promotion to senior designer",
    desiredEnd: "Reading the email that says it's official, and telling my mum.",
    circumstances: null,
    relevantDate: null,
  },
  affirmations: { mode: "own", items: ["I am the obvious choice.", "My work speaks for itself."] },
  techniques: { suggestForMe: false, love: ["affirmations", "sats"], fine: ["visualization"], avoid: ["scripting"], otherLabel: null },
  schedule: {
    wakeTime: "07:00",
    sleepTime: "23:00",
    typicalDay: "Work 9–5, lunch 1–2, gym Mon/Wed/Fri 6–7.",
    weekendsDifferent: false,
    weekendDescription: null,
    commitments: [
      commitment({ kind: "commute", label: "Commute in", weekdays: [1, 2, 3, 4, 5], start: "08:00", end: "08:45", manifestationOverlap: { availability: "some", techniques: ["affirmations", "subliminals"], otherLabel: null } }),
      commitment({ kind: "work", label: "Work", weekdays: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }),
      commitment({ kind: "commute", label: "Commute home", weekdays: [1, 2, 3, 4, 5], start: "17:00", end: "17:45", manifestationOverlap: { availability: "some", techniques: ["affirmations", "subliminals"], otherLabel: null } }),
      commitment({ kind: "gym", label: "Gym", weekdays: [1, 3, 5], start: "18:00", end: "19:00", manifestationOverlap: { availability: "some", techniques: ["affirmations"], otherLabel: null } }),
    ],
  },
  intensity: { timeBudget: "custom", minutesPerDay: [20, 20], style: "balanced", styleNote: null, quietTimes: null },
});

export const universityStudent = base({
  manifestation: { desire: "Getting into my first-choice master's programme", desiredEnd: "Opening the offer email.", circumstances: "Applications close in March.", relevantDate: "2027-03-15" },
  affirmations: { mode: "generate", items: [] },
  techniques: { suggestForMe: false, love: ["scripting", "askfirmations"], fine: ["visualization"], avoid: ["subliminals"], otherLabel: null },
  schedule: {
    wakeTime: "09:00",
    sleepTime: "01:00",
    typicalDay: "Lectures most mornings, library in the afternoon, part-time bar job Thu–Sat evenings.",
    weekendsDifferent: true,
    weekendDescription: "Sleep in until 11 on Sundays.",
    commitments: [
      commitment({ kind: "class", label: "Lectures", weekdays: [1, 2, 3, 4, 5], start: "10:00", end: "13:00" }),
      commitment({ kind: "work", label: "Bar shift", weekdays: [4, 5, 6], start: "18:00", end: "23:30" }),
      commitment({ kind: "other", label: "Walk to campus", weekdays: [1, 2, 3, 4, 5], start: "09:35", end: "09:55", manifestationOverlap: { availability: "yes", techniques: [], otherLabel: null } }),
    ],
  },
  intensity: { timeBudget: "15_30", minutesPerDay: [15, 30], style: "structured", styleNote: null, quietTimes: "During lectures" },
});

/** Awake 17:00 → 09:00, nights 19:30–07:30 Mon–Wed. */
export const nightShiftNurse = base({
  manifestation: { desire: "A calm, loving relationship", desiredEnd: "Coming home after a shift to someone who's made breakfast.", circumstances: null, relevantDate: null },
  affirmations: { mode: "own", items: ["I am loved on my worst days too.", "Love is easy for me."] },
  techniques: { suggestForMe: false, love: ["sats", "inner_conversations"], fine: ["affirmations"], avoid: ["meditation"], otherLabel: null },
  schedule: {
    wakeTime: "15:00",
    sleepTime: "08:30",
    typicalDay: "Three 12-hour night shifts a week. I drive to the hospital.",
    weekendsDifferent: false,
    weekendDescription: null,
    commitments: [
      commitment({ kind: "commute", label: "Drive to hospital", weekdays: [1, 2, 3], start: "19:00", end: "19:30", manifestationOverlap: { availability: "some", techniques: ["affirmations", "inner_conversations"], otherLabel: null } }),
      commitment({ kind: "work", label: "Night shift", weekdays: [1, 2, 3], start: "19:30", end: "07:30" }),
    ],
  },
  intensity: { timeBudget: "15_30", minutesPerDay: [15, 30], style: "balanced", styleNote: null, quietTimes: null },
});

export const stayAtHomeParent = base({
  manifestation: { desire: "£20,000 in savings", desiredEnd: "Seeing the balance and not worrying.", circumstances: null, relevantDate: null },
  affirmations: { mode: "generate", items: [] },
  techniques: { suggestForMe: true, love: [], fine: [], avoid: ["scripting"], otherLabel: null },
  schedule: {
    wakeTime: "06:00",
    sleepTime: "22:00",
    typicalDay: "School run at 8:15 and 15:00, toddler naps 13:00–14:30.",
    weekendsDifferent: false,
    weekendDescription: null,
    commitments: [
      commitment({ kind: "childcare", label: "School run", weekdays: [1, 2, 3, 4, 5], start: "08:15", end: "09:00" }),
      commitment({ kind: "childcare", label: "Afternoon pickup", weekdays: [1, 2, 3, 4, 5], start: "15:00", end: "15:45" }),
      commitment({ kind: "other", label: "Toddler nap", weekdays: [1, 2, 3, 4, 5, 6, 7], start: "13:00", end: "14:30", manifestationOverlap: { availability: "yes", techniques: [], otherLabel: null } }),
    ],
  },
  intensity: { timeBudget: "5_10", minutesPerDay: [5, 10], style: "light", styleNote: null, quietTimes: "Bath and bedtime, 18:30–19:30" },
});

export const freelancer = base({
  manifestation: { desire: "Three retainer clients", desiredEnd: "Invoices going out on the 1st without chasing work.", circumstances: null, relevantDate: null },
  affirmations: { mode: "own", items: ["Clients find me easily.", "My calendar is full of work I love."] },
  techniques: { suggestForMe: false, love: ["visualization", "scripting"], fine: ["affirmations", "revision"], avoid: [], otherLabel: null },
  schedule: {
    wakeTime: "08:00",
    sleepTime: "00:00",
    typicalDay: "Flexible — deep work late morning, calls in the afternoon.",
    weekendsDifferent: true,
    weekendDescription: "No work at weekends.",
    commitments: [commitment({ kind: "work", label: "Client calls", weekdays: [1, 2, 3, 4], start: "14:00", end: "16:00" })],
  },
  intensity: { timeBudget: "30_60", minutesPerDay: [30, 60], style: "structured", styleNote: null, quietTimes: null },
});

export const minimalFiveMinutes = base({
  manifestation: { desire: "A new job", desiredEnd: null, circumstances: null, relevantDate: null },
  affirmations: { mode: "own", items: ["I have the job."] },
  techniques: { suggestForMe: false, love: ["affirmations"], fine: [], avoid: [], otherLabel: null },
  intensity: { timeBudget: "custom", minutesPerDay: [5, 5], style: "light", styleNote: null, quietTimes: null },
});

export const noAffirmations = base({
  manifestation: { desire: "Healing my relationship with my sister", desiredEnd: "Laughing together at Christmas.", circumstances: null, relevantDate: null },
  affirmations: { mode: "none", items: [] },
  techniques: { suggestForMe: false, love: ["visualization", "revision"], fine: ["inner_conversations"], avoid: ["affirmations", "askfirmations"], otherLabel: null },
});

export const hourlyPreference = base({
  manifestation: { desire: "Confidence speaking up", desiredEnd: null, circumstances: null, relevantDate: null },
  affirmations: { mode: "generate", items: [] },
  techniques: { suggestForMe: false, love: ["affirmations", "askfirmations"], fine: ["inner_conversations"], avoid: [], otherLabel: null },
  intensity: { timeBudget: "30_60", minutesPerDay: [30, 60], style: "hourly", styleNote: null, quietTimes: null },
});

/** Contradictory data: a commitment that runs past their sleep time, overlapping activities. */
export const conflictingData = base({
  manifestation: { desire: "A published book", desiredEnd: null, circumstances: null, relevantDate: null },
  affirmations: { mode: "generate", items: [] },
  techniques: { suggestForMe: false, love: ["scripting"], fine: ["visualization"], avoid: [], otherLabel: null },
  schedule: {
    wakeTime: "06:30",
    sleepTime: "22:30",
    typicalDay: "Work 8–6 but sometimes until 11pm.",
    weekendsDifferent: false,
    weekendDescription: null,
    commitments: [
      commitment({ kind: "work", label: "Work", weekdays: [1, 2, 3, 4, 5], start: "08:00", end: "18:00" }),
      commitment({ kind: "work", label: "Late work", weekdays: [2, 4], start: "17:00", end: "23:00" }),
      commitment({ kind: "gym", label: "Gym", weekdays: [1, 2, 3, 4, 5], start: "17:30", end: "18:30", manifestationOverlap: { availability: "some", techniques: ["affirmations"], otherLabel: null } }),
    ],
  },
});

export const fixtures = {
  officeWorker,
  universityStudent,
  nightShiftNurse,
  stayAtHomeParent,
  freelancer,
  minimalFiveMinutes,
  noAffirmations,
  hourlyPreference,
  conflictingData,
} satisfies Record<string, IntakeSnapshotV2>;

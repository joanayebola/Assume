import { commitmentKinds, techniqueInfo } from "@/content/intake";
import { formatClock, formatWeekdays } from "@/lib/intake/format";
import { SCHEDULE_OVERLAP_GUIDANCE } from "@/lib/intake/generation-guidance";
import { careGuidance, careThemes } from "./safety";
import type { Technique, Weekday } from "@/lib/intake/model";
import type { IntakeSnapshotV2 } from "@/lib/intake/snapshot";
import type { PlanDoc, Session } from "@/lib/plan/schema";

/**
 * Prompts for routine generation. The system instruction carries the
 * product's principles; the user turn carries this person's facts as JSON
 * plus a precomputed plain-language view of their week.
 */

export const PRINCIPLES = [
  "Techniques are tools, not requirements.",
  "Never imply that perfect thoughts, perfect emotions, perfect self-concept, detachment, constant positivity or never reacting are prerequisites.",
  "Never imply that missing a session ruins or delays the manifestation.",
  "More techniques do not automatically mean a better routine.",
  "Do not unnecessarily overload the user.",
  "Respect the user's requested daily time budget.",
  "Respect techniques they dislike: never schedule a technique listed in techniques.avoid.",
  "If affirmations.mode is 'none', do not include affirmations anywhere — no affirmation sessions, no affirmation lists.",
  "If the user supplied affirmations, use their exact wording first rather than replacing or rewriting them.",
  "If affirmations.mode is 'generate', write a manageable number (3–6) personalised to their desire and desired end.",
  "Do not turn circumstances into arbitrary limitations or rules.",
  "Do not make scientific claims about manifestation.",
  "Do not promise that a manifestation will occur, and do not guarantee anything by a date.",
  "Do not ignore practical real-world responsibilities.",
  "Where health, legal, safety or pressing money matters come up, the practice supports real-world help and action — never discourage seeing a doctor, lawyer or other professional, taking medication, or getting to safety.",
  "Never suggest unsafe, obsessive, illegal or boundary-violating behaviour (e.g. contacting a specific person, surveillance, spending money they don't have).",
  "Do not schedule practice while the user is unavailable: activities with availability 'no', their quiet times, or while they're asleep.",
  "Do not assume wake and sleep times are identical every day if they describe different weekends or shift patterns.",
  "A busy day may have a lighter practice than a quiet one.",
  "The plan must fit the user's life; never ask their life to fit manifestation.",
  "Do not produce a generic morning/midday/night template. Derive the structure from this person's actual week.",
];

const SCHEDULING_RULES = `
Scheduling context:
- Commutes suit audio and spoken techniques (affirmations, askfirmations, subliminals, inner conversations). Never schedule eyes-closed or writing techniques (visualization, SATS, meditation, scripting) during a commute unless the user explicitly listed that technique for it — and never anything distracting if they might be driving.
- SATS belongs at bedtime: start it no earlier than 45 minutes before their sleep time.
- Scripting needs a quiet window where they can write — not during work, class, childcare or travel.
- Short breaks suit short techniques (1–5 minutes). Longer visualization should use genuine free time.
- Overnight or shift schedules: their "day" runs from wake time to sleep time even if that crosses midnight. A session at 02:00 is fine for someone awake 19:00–07:00; it is not fine for someone asleep then.
- Gym, walks and chores can carry affirmations or subliminals if the user allows overlap.
- Leave breathing room: never stack sessions back-to-back, and never overlap two sessions.
`.trim();

const OUTPUT_RULES = `
Output rules:
- Return only JSON matching the provided schema.
- Times are 24-hour HH:MM in the user's local time. Days are ISO numbers: 1 = Monday … 7 = Sunday.
- For every weekday, the total durationMinutes of non-optional sessions on that day must fall within intensity.minutesPerDay (a lighter day may go below the minimum; never exceed the maximum). Optional sessions don't count, so keep them few and short.
- Routine style: 'light' = at most 2–3 short sessions a day; 'balanced' = a few spread naturally; 'structured' = clear fixed times; 'hourly' = brief touchpoints through the waking day (at least 6 a day); 'custom' = follow styleNote.
- Every session needs a concrete fitReason that names the part of their day it uses.
- Affirmation sessions list the affirmation texts they use. Askfirmation sessions list actual questions ending in '?'. Visualization, SATS and revision sessions include a visualizationPrompt. Scripting sessions include a scriptingPrompt. Leave other content fields empty.
- Use 'patterns' to describe how different kinds of days work (e.g. 'Workdays', 'Gym days', 'Weekends', 'Shift nights').
- Don't state minute totals in title, explanation or philosophy — the app calculates and shows the daily time from the sessions.
- Write warmly and plainly. No mystical jargon, no pressure, no guilt.
`.trim();

export function systemInstruction() {
  return [
    "You design personalised manifestation routines for Assume, an app whose promise is: manifestation that fits your actual life.",
    "You are given one person's intake. Build a practice that slots into the day they actually have, using techniques they actually like.",
    "",
    "Principles (non-negotiable):",
    ...PRINCIPLES.map((p, i) => `${i + 1}. ${p}`),
    "",
    SCHEDULE_OVERLAP_GUIDANCE,
    "",
    SCHEDULING_RULES,
    "",
    OUTPUT_RULES,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// The person's week, in plain language
// ---------------------------------------------------------------------------

const techniqueList = (ts: Technique[]) => ts.map((t) => techniqueInfo[t].label).join(", ") || "none";

export function describeWeek(s: IntakeSnapshotV2): string {
  const lines: string[] = [];
  lines.push(`Awake: ${formatClock(s.schedule.wakeTime)} → asleep ${formatClock(s.schedule.sleepTime)}.`);
  if (s.schedule.weekendsDifferent) {
    lines.push(`Weekends are different: ${s.schedule.weekendDescription ?? "(no details)"}.`);
  }
  for (const c of s.schedule.commitments) {
    const when = c.start && c.end ? `${formatClock(c.start)}–${formatClock(c.end)}` : c.start ? `from ${formatClock(c.start)}` : "time not given";
    const o = c.manifestationOverlap;
    const overlap =
      o.availability === "yes"
        ? "user can manifest during this"
        : o.availability === "some"
          ? `user can do only: ${techniqueList(o.techniques)}${o.otherLabel ? ` (other: ${o.otherLabel})` : ""}`
          : "UNAVAILABLE — do not schedule practice during this";
    lines.push(`${c.label || commitmentKinds[c.kind].label} (${c.kind}) — ${formatWeekdays(c.weekdays as Weekday[])}, ${when}; ${overlap}.`);
  }
  if (s.intensity.quietTimes) lines.push(`No reminders during: ${s.intensity.quietTimes}.`);
  return lines.join("\n");
}

function daysUntil(dateISO: string, now: Date) {
  const target = new Date(`${dateISO}T00:00:00Z`).getTime();
  return Math.round((target - now.getTime()) / 86_400_000);
}

export function intakeContext(s: IntakeSnapshotV2, now = new Date()) {
  const [min, max] = s.intensity.minutesPerDay;
  return {
    intake: s,
    derived: {
      weekOverview: describeWeek(s),
      dailyBudget: max === null ? `at least ${min} minutes, sensibly capped` : `${min}–${max} minutes`,
      allowedTechniques: {
        love: techniqueList(s.techniques.love),
        fine: techniqueList(s.techniques.fine),
        neverUse: techniqueList(s.techniques.avoid),
        suggestForMe: s.techniques.suggestForMe,
      },
      relevantDate: s.manifestation.relevantDate
        ? `${s.manifestation.relevantDate} (${daysUntil(s.manifestation.relevantDate, now)} days away — use for gentle pacing only; never promise anything by then)`
        : null,
      care: careGuidance(careThemes(s)),
    },
  };
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

function feedbackBlock(feedback?: string[]) {
  if (!feedback?.length) return "";
  return [
    "",
    "Your previous answer had these problems. Fix every one of them in this answer:",
    ...feedback.map((f) => `- ${f}`),
  ].join("\n");
}

export function createPlanPrompt(s: IntakeSnapshotV2, feedback?: string[], now = new Date()) {
  return [
    "Create this person's routine.",
    "",
    "```json",
    JSON.stringify(intakeContext(s, now), null, 2),
    "```",
    feedbackBlock(feedback),
  ].join("\n");
}

export const ADJUSTMENTS = [
  "lighter",
  "more_structured",
  "less_morning",
  "less_evening",
  "more_affirmations",
  "fewer_affirmations",
  "remove_technique",
  "schedule_changed",
  "custom",
] as const;
export type AdjustmentKind = (typeof ADJUSTMENTS)[number];

export type AdjustmentRequest = {
  kinds: AdjustmentKind[];
  removeTechniques: Technique[];
  scheduleChange: string;
  customInstruction: string;
  keepEditedSessions: boolean;
};

const adjustmentText: Record<AdjustmentKind, (a: AdjustmentRequest) => string | null> = {
  lighter: () => "Make it lighter: fewer or shorter sessions (stay at the low end of the budget or below).",
  more_structured: () => "Make it more structured: clearer fixed times, less 'whenever'.",
  less_morning: () => "Less morning practice: move or remove practice before midday.",
  less_evening: () => "Less evening practice: move or remove practice after 6pm (a short bedtime SATS can stay only if they love SATS).",
  more_affirmations: () => "More affirmations: give affirmations a bigger role (only if affirmations are allowed).",
  fewer_affirmations: () => "Fewer affirmations: reduce affirmation practice.",
  remove_technique: (a) => (a.removeTechniques.length ? `Remove these techniques entirely: ${techniqueList(a.removeTechniques)}.` : null),
  schedule_changed: (a) => (a.scheduleChange.trim() ? `Their schedule changed: ${a.scheduleChange.trim()}` : "Their schedule changed."),
  custom: (a) => (a.customInstruction.trim() ? `Their request: ${a.customInstruction.trim()}` : null),
};

/** Sessions sent to the model without internal fields. */
function sessionForModel(s: Session, doc: PlanDoc) {
  const lib = new Map(doc.affirmations.map((a) => [a.id, a.text]));
  const ask = new Map(doc.askfirmations.map((a) => [a.id, a.text]));
  return {
    title: s.title,
    technique: s.technique,
    days: s.days,
    startTime: s.startTime,
    durationMinutes: s.durationMinutes,
    optional: s.optional,
    instructions: s.instructions,
    affirmations: s.affirmationIds.map((id) => lib.get(id)).filter(Boolean),
    askfirmations: s.askfirmationIds.map((id) => ask.get(id)).filter(Boolean),
    contextActivity: s.contextActivity,
  };
}

export function adjustPlanPrompt(
  s: IntakeSnapshotV2,
  current: PlanDoc,
  pinned: Session[],
  adjustment: AdjustmentRequest,
  feedback?: string[],
  now = new Date(),
) {
  const requests = adjustment.kinds.map((k) => adjustmentText[k](adjustment)).filter(Boolean);
  const movable = current.sessions.filter((x) => !pinned.some((p) => p.id === x.id));
  return [
    "Adjust this person's existing routine. Change only what the request needs; keep everything else recognisable.",
    "",
    "Requested changes:",
    ...requests.map((r) => `- ${r}`),
    "",
    pinned.length
      ? "These sessions were edited by the user and are FIXED. Do not return them; plan around them (they count toward the daily budget and must not be overlapped):"
      : "",
    pinned.length ? "```json\n" + JSON.stringify(pinned.map((p) => sessionForModel(p, current)), null, 2) + "\n```" : "",
    "Current adjustable sessions (return the full new set of adjustable sessions):",
    "```json",
    JSON.stringify(movable.map((m) => sessionForModel(m, current)), null, 2),
    "```",
    "",
    "Their intake:",
    "```json",
    JSON.stringify(intakeContext(s, now), null, 2),
    "```",
    adjustment.kinds.includes("schedule_changed") && adjustment.scheduleChange.trim()
      ? "Where the schedule change contradicts the intake, the schedule change wins."
      : "",
    "Return a complete plan object. Keep the title unless the change makes it wrong. Only include new generatedAffirmations if affirmations should grow.",
    feedbackBlock(feedback),
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export function regenerateSessionPrompt(
  s: IntakeSnapshotV2,
  current: PlanDoc,
  target: Session,
  note: string,
  feedback?: string[],
  now = new Date(),
) {
  const others = current.sessions.filter((x) => x.id !== target.id);
  return [
    "Replace ONE session in this person's routine with a fresh alternative that fits the same part of their day.",
    note.trim() ? `Their note: ${note.trim()}` : "Offer a genuinely different take (technique or approach), still within their preferences.",
    "",
    "Session to replace:",
    "```json",
    JSON.stringify(sessionForModel(target, current), null, 2),
    "```",
    "Other sessions (keep clear of these; they stay as they are):",
    "```json",
    JSON.stringify(others.map((o) => sessionForModel(o, current)), null, 2),
    "```",
    "Their intake:",
    "```json",
    JSON.stringify(intakeContext(s, now), null, 2),
    "```",
    "Return a single session object. Keep the same days unless the note asks otherwise, and keep the day's total within budget.",
    feedbackBlock(feedback),
  ].join("\n");
}

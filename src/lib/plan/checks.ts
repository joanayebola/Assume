import { commitmentKinds, techniqueInfo } from "@/content/intake";
import { formatClock, formatWeekdays } from "@/lib/intake/format";
import type { Technique, Weekday } from "@/lib/intake/model";
import type { IntakeSnapshotV2 } from "@/lib/intake/snapshot";

import { sortSessions } from "./build";
import { minutesByDay, type PlanDoc, type Session } from "./schema";
import { overlapMinutes, spanInterval, toMinutes, weekInterval, withinAwakeWindow } from "./time";

/**
 * Application-level sanity checks on a generated plan.
 *
 * Every rule that can be verified mechanically is verified here — the model
 * is never trusted on budget, placement, preferences or safety. Each problem
 * carries a message written for the model (used in a repair attempt) and,
 * where safe, an automatic fix used as a last resort.
 */

export type Fix =
  | { kind: "remove_session"; sessionId: string }
  | { kind: "clear_affirmations" }
  | { kind: "use_user_affirmations"; sessionId: string }
  | { kind: "fill_prompt"; sessionId: string; field: "visualizationPrompt" | "scriptingPrompt" }
  | { kind: "trim_day"; day: Weekday; maxMinutes: number }
  | { kind: "strip_language"; pattern: string }
  | { kind: "none" };

export type Problem = {
  code:
    | "empty_plan"
    | "avoided_technique"
    | "affirmations_not_wanted"
    | "user_affirmations_ignored"
    | "outside_awake_hours"
    | "sats_timing"
    | "unavailable_overlap"
    | "technique_not_allowed_during"
    | "unsafe_during_commute"
    | "sessions_overlap"
    | "over_budget"
    | "style_light"
    | "style_hourly"
    | "missing_content"
    | "banned_language";
  message: string;
  sessionId?: string;
  fix: Fix;
};

/** Techniques that need eyes closed, stillness or writing — unsafe while travelling. */
const NOT_WHILE_TRAVELLING: Technique[] = ["visualization", "sats", "meditation", "scripting", "revision"];

/**
 * Language the product never uses: guarantees, science claims, guilt about
 * missed sessions, and "you must feel/believe" prerequisites.
 */
export const BANNED_LANGUAGE: { pattern: RegExp; why: string }[] = [
  { pattern: /\bguarantee[ds]?\b/i, why: "promises an outcome" },
  { pattern: /\b(scientific(ally)?|science (shows|proves|says)|studies (show|prove)|neuroscience|quantum)\b/i, why: "makes a scientific claim" },
  { pattern: /\bprove[ns]?\b/i, why: "claims proof" },
  { pattern: /\b(if|when) you (miss|skip)\b/i, why: "implies missing a session has consequences" },
  { pattern: /\b(ruin|undo|block|delay|sabotage)s? (your|the) (manifestation|progress|results?)\b/i, why: "implies missing or feeling wrong ruins it" },
  { pattern: /\bnever (miss|skip)\b/i, why: "pressures perfect attendance" },
  { pattern: /\bstreaks?\b/i, why: "uses streak pressure" },
  { pattern: /\byou (must|have to|need to) (always )?(feel|believe|stay|be) (positive|certain|detached|happy|calm)/i, why: "sets an emotional prerequisite" },
  { pattern: /\bwill (definitely|certainly) (manifest|happen|come)\b/i, why: "promises an outcome" },
  {
    pattern: /\b(instead of|rather than|no need (for|to)|don'?t need( to)?|without) (seeing |calling |a |an |the |your )*(doctors?|therap(y|ists?)|lawyers?|attorneys?|solicitors?|treatment|medication|medical (care|help|advice)|professional help|police|emergency services)\b/i,
    why: "discourages real-world help",
  },
  { pattern: /\b(stop|skip|quit|avoid) (taking )?(your )?(medication|meds|treatment|therapy)\b/i, why: "discourages real-world help" },
  { pattern: /\b(cure|heal)s? (your |the )?(cancer|illness|disease|diagnosis)\b/i, why: "makes a medical claim" },
];

const label = (t: Technique, custom = "") => (t === "other" && custom ? custom : techniqueInfo[t].label);

function sessionLabel(s: Session) {
  return `"${s.title}" (${formatWeekdays(s.days)} ${formatClock(s.startTime)}, ${s.durationMinutes} min)`;
}

function textFields(doc: PlanDoc): { where: string; text: string; sessionId?: string }[] {
  const out: { where: string; text: string; sessionId?: string }[] = [
    { where: "title", text: doc.title },
    { where: "explanation", text: doc.explanation },
    { where: "philosophy", text: doc.philosophy },
    ...doc.patterns.map((p) => ({ where: `pattern "${p.label}"`, text: p.summary })),
    ...doc.affirmations.map((a) => ({ where: "an affirmation", text: a.text })),
    ...doc.askfirmations.map((a) => ({ where: "an askfirmation", text: a.text })),
  ];
  for (const s of doc.sessions) {
    for (const f of ["title", "instructions", "visualizationPrompt", "scriptingPrompt", "notes", "fitReason"] as const) {
      if (s[f]) out.push({ where: `session ${sessionLabel(s)}`, text: s[f], sessionId: s.id });
    }
  }
  return out;
}

export type CheckOptions = {
  /** Sessions the user fixed; they're checked for overlap but never auto-removed. */
  protectedIds?: Set<string>;
};

export function checkPlan(doc: PlanDoc, s: IntakeSnapshotV2, opts: CheckOptions = {}): Problem[] {
  const problems: Problem[] = [];
  const protectedIds = opts.protectedIds ?? new Set<string>();
  const removable = (id: string): Fix => (protectedIds.has(id) ? { kind: "none" } : { kind: "remove_session", sessionId: id });
  const sessions = doc.sessions;

  if (sessions.length === 0) {
    problems.push({ code: "empty_plan", message: "The plan has no sessions.", fix: { kind: "none" } });
    return problems;
  }

  const userAffIds = new Set(doc.affirmations.filter((a) => a.source === "user").map((a) => a.id));

  for (const x of sessions) {
    // Preferences -----------------------------------------------------------
    if (s.techniques.avoid.includes(x.technique)) {
      problems.push({
        code: "avoided_technique",
        sessionId: x.id,
        message: `${sessionLabel(x)} uses ${label(x.technique)}, which the user asked never to be given.`,
        fix: removable(x.id),
      });
    }
    if (s.affirmations.mode === "none" && x.technique === "affirmations") {
      problems.push({
        code: "affirmations_not_wanted",
        sessionId: x.id,
        message: `${sessionLabel(x)} is an affirmation session, but the user doesn't want affirmations.`,
        fix: removable(x.id),
      });
    }
    if (
      s.affirmations.mode === "own" &&
      x.technique === "affirmations" &&
      userAffIds.size > 0 &&
      !x.affirmationIds.some((id) => userAffIds.has(id))
    ) {
      problems.push({
        code: "user_affirmations_ignored",
        sessionId: x.id,
        message: `${sessionLabel(x)} doesn't use any of the user's own affirmations. Use their exact wording.`,
        fix: { kind: "use_user_affirmations", sessionId: x.id },
      });
    }

    // Content ------------------------------------------------------------------
    if (["visualization", "sats", "revision"].includes(x.technique) && !x.visualizationPrompt.trim()) {
      problems.push({
        code: "missing_content",
        sessionId: x.id,
        message: `${sessionLabel(x)} needs a visualizationPrompt describing the scene.`,
        fix: { kind: "fill_prompt", sessionId: x.id, field: "visualizationPrompt" },
      });
    }
    if (x.technique === "scripting" && !x.scriptingPrompt.trim()) {
      problems.push({
        code: "missing_content",
        sessionId: x.id,
        message: `${sessionLabel(x)} needs a scriptingPrompt.`,
        fix: { kind: "fill_prompt", sessionId: x.id, field: "scriptingPrompt" },
      });
    }

    // Placement ------------------------------------------------------------------
    const weekendExempt = (d: Weekday) => s.schedule.weekendsDifferent && d >= 6;
    const outside = x.days.filter(
      (d) =>
        !weekendExempt(d) &&
        !withinAwakeWindow(d, x.startTime, x.durationMinutes, s.schedule.wakeTime, s.schedule.sleepTime, x.technique === "sats" ? 30 : 0),
    );
    if (outside.length) {
      problems.push({
        code: "outside_awake_hours",
        sessionId: x.id,
        message: `${sessionLabel(x)} falls outside their waking hours (${formatClock(s.schedule.wakeTime)}–${formatClock(s.schedule.sleepTime)}) on ${formatWeekdays(outside)}.`,
        fix: removable(x.id),
      });
    }
    if (x.technique === "sats") {
      const beforeSleep = (toMinutes(s.schedule.sleepTime) - toMinutes(x.startTime) + 1440) % 1440;
      const afterSleep = (toMinutes(x.startTime) - toMinutes(s.schedule.sleepTime) + 1440) % 1440;
      if (beforeSleep > 60 && afterSleep > 30) {
        problems.push({
          code: "sats_timing",
          sessionId: x.id,
          message: `${sessionLabel(x)} is SATS but isn't near bedtime (${formatClock(s.schedule.sleepTime)}). SATS happens as they fall asleep.`,
          fix: removable(x.id),
        });
      }
    }

    // Activities -------------------------------------------------------------------
    for (const c of s.schedule.commitments) {
      if (!c.start || !c.end) continue;
      const sharedDays = x.days.flatMap((d) => c.weekdays.flatMap((cd) => [[d, cd] as const]));
      const clash = sharedDays.some(
        ([d, cd]) => overlapMinutes(weekInterval(d, x.startTime, x.durationMinutes), spanInterval(cd as Weekday, c.start!, c.end!)) > 0,
      );
      if (!clash) continue;
      const name = c.label || commitmentKinds[c.kind].label;
      const o = c.manifestationOverlap;
      if (o.availability === "no") {
        problems.push({
          code: "unavailable_overlap",
          sessionId: x.id,
          message: `${sessionLabel(x)} overlaps "${name}" (${formatClock(c.start)}–${formatClock(c.end)}), when the user said they can't manifest.`,
          fix: removable(x.id),
        });
      } else if (o.availability === "some" && !o.techniques.includes(x.technique as never)) {
        problems.push({
          code: "technique_not_allowed_during",
          sessionId: x.id,
          message: `${sessionLabel(x)} uses ${label(x.technique)} during "${name}", but they only want ${o.techniques.map((t) => label(t)).join(", ")} then.`,
          fix: removable(x.id),
        });
      } else if (o.availability === "yes" && c.kind === "commute" && NOT_WHILE_TRAVELLING.includes(x.technique)) {
        problems.push({
          code: "unsafe_during_commute",
          sessionId: x.id,
          message: `${sessionLabel(x)} uses ${label(x.technique)} during their commute. They may be driving — use audio or spoken techniques only.`,
          fix: removable(x.id),
        });
      }
    }
  }

  // Sessions overlapping each other -------------------------------------------------
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const a = sessions[i];
      const b = sessions[j];
      const clash = a.days.some((d) =>
        b.days.some(
          (e) => overlapMinutes(weekInterval(d, a.startTime, a.durationMinutes), weekInterval(e, b.startTime, b.durationMinutes)) > 0,
        ),
      );
      if (clash) {
        const victim = protectedIds.has(b.id) ? a : b;
        problems.push({
          code: "sessions_overlap",
          sessionId: victim.id,
          message: `${sessionLabel(a)} and ${sessionLabel(b)} overlap.`,
          fix: removable(victim.id),
        });
      }
    }
  }

  // Budget -----------------------------------------------------------------------------
  const [, rawMax] = s.intensity.minutesPerDay;
  const max = rawMax ?? 240;
  const tolerance = Math.max(2, Math.round(max * 0.1));
  const byDay = minutesByDay(doc);
  for (const d of [1, 2, 3, 4, 5, 6, 7] as Weekday[]) {
    if (byDay[d] > max + tolerance) {
      problems.push({
        code: "over_budget",
        message: `${formatWeekdays([d])} totals ${byDay[d]} minutes, over their ${max}-minute maximum.`,
        fix: { kind: "trim_day", day: d, maxMinutes: max },
      });
    }
  }

  // Style ------------------------------------------------------------------------------
  const countByDay = (d: Weekday) => sessions.filter((x) => !x.optional && x.days.includes(d)).length;
  const counts = ([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map(countByDay);
  if (s.intensity.style === "light" && Math.max(...counts) > 3) {
    problems.push({
      code: "style_light",
      message: `They asked for a light routine, but some days have ${Math.max(...counts)} sessions. Keep it to 2–3.`,
      fix: { kind: "none" },
    });
  }
  if (s.intensity.style === "hourly" && Math.max(...counts) < 4) {
    problems.push({
      code: "style_hourly",
      message: "They asked for something scheduled throughout the day; add brief touchpoints across their waking hours.",
      fix: { kind: "none" },
    });
  }

  // Affirmations library when not wanted --------------------------------------------------
  if (s.affirmations.mode === "none" && (doc.affirmations.length > 0 || sessions.some((x) => x.affirmationIds.length))) {
    problems.push({
      code: "affirmations_not_wanted",
      message: "The user doesn't want affirmations, but the plan includes some.",
      fix: { kind: "clear_affirmations" },
    });
  }

  // Language ----------------------------------------------------------------------------------
  for (const f of textFields(doc)) {
    for (const b of BANNED_LANGUAGE) {
      if (b.pattern.test(f.text)) {
        problems.push({
          code: "banned_language",
          sessionId: f.sessionId,
          message: `The ${f.where} ${b.why} ("${f.text.match(b.pattern)?.[0]}"). Assume never does this.`,
          fix: { kind: "strip_language", pattern: b.pattern.source },
        });
      }
    }
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Last-resort automatic fixes
// ---------------------------------------------------------------------------

function stripSentences(text: string, pattern: RegExp) {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  return sentences
    .filter((s) => !pattern.test(s))
    .join("")
    .trim();
}

export function applyFixes(doc: PlanDoc, problems: Problem[], protectedIds: Set<string> = new Set()): PlanDoc {
  let next: PlanDoc = { ...doc, sessions: doc.sessions.map((s) => ({ ...s })) };

  const removals = new Set(problems.flatMap((p) => (p.fix.kind === "remove_session" ? [p.fix.sessionId] : [])));
  next.sessions = next.sessions.filter((s) => !removals.has(s.id));

  for (const p of problems) {
    const f = p.fix;
    if (f.kind === "clear_affirmations") {
      next.affirmations = [];
      next.sessions = next.sessions.map((s) => ({ ...s, affirmationIds: [] }));
    } else if (f.kind === "use_user_affirmations") {
      const ids = next.affirmations.filter((a) => a.source === "user").map((a) => a.id);
      next.sessions = next.sessions.map((s) => (s.id === f.sessionId ? { ...s, affirmationIds: ids.slice(0, 12) } : s));
    } else if (f.kind === "fill_prompt") {
      next.sessions = next.sessions.map((s) =>
        s.id === f.sessionId && !s[f.field].trim() ? { ...s, [f.field]: s.instructions } : s,
      );
    } else if (f.kind === "strip_language") {
      const re = new RegExp(f.pattern, "i");
      next = {
        ...next,
        explanation: stripSentences(next.explanation, re),
        philosophy: stripSentences(next.philosophy, re),
        patterns: next.patterns.map((pt) => ({ ...pt, summary: stripSentences(pt.summary, re) })),
        affirmations: next.affirmations.filter((a) => !re.test(a.text)),
        askfirmations: next.askfirmations.filter((a) => !re.test(a.text)),
        sessions: next.sessions.map((s) => ({
          ...s,
          instructions: stripSentences(s.instructions, re) || s.instructions.replace(re, "").trim(),
          visualizationPrompt: stripSentences(s.visualizationPrompt, re),
          scriptingPrompt: stripSentences(s.scriptingPrompt, re),
          notes: stripSentences(s.notes, re),
          fitReason: stripSentences(s.fitReason, re),
        })),
      };
    }
  }

  // Budget: drop optional sessions on over-budget days, then shorten the longest.
  for (const p of problems) {
    if (p.fix.kind !== "trim_day") continue;
    const { day, maxMinutes } = p.fix;
    const total = () => next.sessions.filter((s) => !s.optional && s.days.includes(day)).reduce((n, s) => n + s.durationMinutes, 0);
    let guard = 500;
    while (total() > maxMinutes && guard-- > 0) {
      const onDay = next.sessions.filter((s) => !s.optional && s.days.includes(day) && !protectedIds.has(s.id));
      const longest = onDay.sort((a, b) => b.durationMinutes - a.durationMinutes)[0];
      if (!longest || longest.durationMinutes <= 1) break;
      next.sessions = next.sessions.map((s) => (s.id === longest.id ? { ...s, durationMinutes: s.durationMinutes - 1 } : s));
    }
  }

  // Keep library references valid.
  const aIds = new Set(next.affirmations.map((a) => a.id));
  const qIds = new Set(next.askfirmations.map((a) => a.id));
  next.sessions = sortSessions(
    next.sessions.map((s) => ({
      ...s,
      affirmationIds: s.affirmationIds.filter((id) => aIds.has(id)),
      askfirmationIds: s.askfirmationIds.filter((id) => qIds.has(id)),
    })),
  );
  return next;
}

/** Problems that still block saving after fixes. */
export function blockingProblems(problems: Problem[]) {
  return problems.filter((p) => p.fix.kind === "none" && !["style_light", "style_hourly"].includes(p.code));
}

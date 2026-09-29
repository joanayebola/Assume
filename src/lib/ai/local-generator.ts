import { commitmentKinds, techniqueInfo } from "@/content/intake";
import { formatClock } from "@/lib/intake/format";
import type { Technique, Weekday } from "@/lib/intake/model";
import type { IntakeSnapshotV2 } from "@/lib/intake/snapshot";
import type { PlanDoc, Session } from "@/lib/plan/schema";
import { awakeLengthMinutes, fromMinutes, overlapMinutes, spanInterval, toMinutes, weekInterval } from "@/lib/plan/time";

import type { RoutineGenerator } from "./generator";
import type { AdjustmentRequest } from "./prompt";
import type { AIPlan, AISession } from "./schema";

/**
 * A deterministic, rule-based generator. It exists so demo mode (no Gemini
 * key) and the test suite can exercise the full pipeline — parsing, checks,
 * persistence, UI — offline. It is not a production fallback: when Gemini is
 * configured it is always used.
 */

const ALL_DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];
const AUDIO: Technique[] = ["affirmations", "askfirmations", "subliminals", "inner_conversations"];
const STILL: Technique[] = ["visualization", "sats", "meditation", "scripting", "revision"];

type Slot = {
  key: string;
  days: Weekday[];
  start: number; // minutes from midnight
  maxDuration: number;
  techniques: Technique[]; // allowed here, best first
  priority: number; // higher first
  context: string;
  reason: string;
  flexible: boolean;
  optional?: boolean;
};

function allowedTechniques(s: IntakeSnapshotV2): Technique[] {
  const avoid = new Set(s.techniques.avoid);
  const ranked: Technique[] = [...s.techniques.love, ...s.techniques.fine];
  if (s.techniques.suggestForMe || ranked.length === 0) {
    ranked.push("visualization", "sats", "affirmations", "askfirmations", "inner_conversations", "meditation");
  }
  if (s.affirmations.mode !== "none" && !ranked.includes("affirmations")) ranked.push("affirmations");
  return [...new Set(ranked)].filter(
    (t) => !avoid.has(t) && !(t === "affirmations" && s.affirmations.mode === "none") && (t !== "other" || !!s.techniques.otherLabel),
  );
}

const shortDesire = (s: IntakeSnapshotV2) => s.manifestation.desire.replace(/[.!?]+$/, "");

/** "My dream flat" → "my dream flat", but never touch names ("Sarah…") or "I". */
function softenFirstWord(text: string) {
  return text.replace(/^(My|A|An|The|Getting|Being|More|Our|Finding|Having)\b/, (w) => w.toLowerCase());
}

function affirmationsFor(s: IntakeSnapshotV2): string[] {
  if (s.affirmations.mode === "own") return s.affirmations.items.slice(0, 6);
  if (s.affirmations.mode === "none") return [];
  const d = shortDesire(s);
  return [`${d} is part of my life now.`, "It came together easily and naturally.", "I'm living what I wanted, and it feels normal."];
}

function askfirmationsFor(s: IntakeSnapshotV2): string[] {
  const d = shortDesire(s);
  return [`Why did ${d} come to me so easily?`, "Why does this feel so natural now?", "How did it all work out so well?"];
}

function sceneFor(s: IntakeSnapshotV2) {
  return s.manifestation.desiredEnd ?? `A moment that could only happen once ${shortDesire(s)} is real.`;
}

function contentFor(t: Technique, s: IntakeSnapshotV2) {
  return {
    affirmations: t === "affirmations" ? affirmationsFor(s).slice(0, 4) : [],
    askfirmations: t === "askfirmations" ? askfirmationsFor(s) : [],
    visualizationPrompt: ["visualization", "sats", "revision"].includes(t) ? sceneFor(s) : "",
    scriptingPrompt: t === "scripting" ? `Write a short journal entry from a day when ${shortDesire(s)} is simply true.` : "",
  };
}

const instructionsFor: Record<Technique, string> = {
  affirmations: "Say or listen to your affirmations slowly. Let them sound like facts, not wishes.",
  askfirmations: "Ask yourself these questions and let your mind wander toward easy answers.",
  visualization: "Close your eyes and step into the scene. Notice one small, real detail.",
  sats: "As you drift off, loop a short scene that implies it's done. It's fine to fall asleep mid-scene.",
  scripting: "Write a few lines as if it has already happened. Keep it casual, like a diary entry.",
  subliminals: "Play your subliminal in the background while you get on with things.",
  inner_conversations: "Imagine a short conversation with someone who's congratulating you.",
  revision: "Replay one moment from today the way you'd have liked it to go.",
  meditation: "Sit quietly and rest in the feeling that it's already yours.",
  other: "Practise your chosen method in whatever way feels natural.",
};

function titleFor(t: Technique, context: string) {
  const name = techniqueInfo[t].label.replace(" / quiet assumption", "");
  return context ? `${context} ${name.toLowerCase()}` : name;
}

function patternsFor(s: IntakeSnapshotV2): AIPlan["patterns"] {
  const work = s.schedule.commitments.find((c) => ["work", "school", "class"].includes(c.kind) && c.weekdays.length);
  const gym = s.schedule.commitments.find((c) => c.kind === "gym" && c.weekdays.length);
  const out: AIPlan["patterns"] = [];
  if (work) out.push({ label: commitmentKinds[work.kind].label === "Work" ? "Workdays" : `${commitmentKinds[work.kind].label} days`, days: work.weekdays, summary: "Practice rides along with the structure your day already has." });
  if (gym) out.push({ label: "Gym days", days: gym.weekdays, summary: "Keep it light — the gym session can carry your practice." });
  const rest = ALL_DAYS.filter((d) => !out.some((p) => p.days.includes(d)));
  if (rest.length) out.push({ label: s.schedule.weekendsDifferent ? "Slower days" : "Other days", days: rest, summary: "Unhurried — practise whenever it feels natural." });
  return out.length ? out : [{ label: "Every day", days: ALL_DAYS, summary: "The same gentle rhythm each day." }];
}

export function buildLocalPlan(s: IntakeSnapshotV2): AIPlan {
  const allowed = allowedTechniques(s);
  const pick = (candidates: Technique[]) => allowed.find((t) => candidates.includes(t));
  const wake = toMinutes(s.schedule.wakeTime);
  const sleep = toMinutes(s.schedule.sleepTime);
  const awake = awakeLengthMinutes(s.schedule.wakeTime, s.schedule.sleepTime);
  const [minBudget, maxBudget] = s.intensity.minutesPerDay;
  const max = maxBudget ?? Math.max(minBudget + 30, 75);
  const style = s.intensity.style;

  const slots: Slot[] = [];

  // Bedtime: SATS where allowed, otherwise a still technique.
  const bedTech = pick(["sats"]) ?? pick(["visualization", "meditation", "revision"]);
  if (bedTech) {
    slots.push({
      key: "bed",
      days: ALL_DAYS,
      start: sleep - (bedTech === "sats" ? 10 : 25),
      maxDuration: bedTech === "sats" ? 10 : 15,
      techniques: [bedTech],
      priority: s.techniques.love.includes(bedTech) ? 9 : 6,
      context: "",
      reason: `Right before you sleep at ${formatClock(s.schedule.sleepTime)} — nothing else needs your attention.`,
      flexible: bedTech !== "sats",
    });
  }

  // Activities the user can manifest during.
  for (const c of s.schedule.commitments) {
    if (!c.start || !c.end || c.manifestationOverlap.availability === "no" || c.weekdays.length === 0) continue;
    const len = awakeLengthMinutes(c.start, c.end);
    let techs: Technique[] =
      c.manifestationOverlap.availability === "some"
        ? allowed.filter((t) => c.manifestationOverlap.techniques.includes(t as never))
        : allowed.filter((t) => (c.kind === "commute" ? AUDIO.includes(t) : t !== "sats" && t !== "scripting"));
    if (c.kind === "commute" && c.manifestationOverlap.availability === "yes") techs = techs.filter((t) => !STILL.includes(t));
    if (!techs.length || len < 8) continue;
    const name = c.label || commitmentKinds[c.kind].label;
    slots.push({
      key: `c-${c.kind}-${c.start}`,
      days: c.weekdays,
      start: toMinutes(c.start) + 5,
      maxDuration: Math.min(15, len - 10),
      techniques: techs,
      priority: 8,
      context: name,
      reason: `${name} is time you already spend — and you said ${techniqueInfo[techs[0]].label.toLowerCase()} works then.`,
      flexible: true,
    });
  }

  // Morning, unless the style is light and something better exists.
  const morningTech = pick(["visualization", "affirmations", "askfirmations", "meditation", "inner_conversations", "scripting"]);
  if (morningTech) {
    const weekendShift = s.schedule.weekendsDifferent ? 60 : 0;
    slots.push({
      key: "wake",
      days: weekendShift ? [1, 2, 3, 4, 5] : ALL_DAYS,
      start: wake + 10,
      maxDuration: morningTech === "scripting" ? 10 : 8,
      techniques: [morningTech],
      priority: 7,
      context: "",
      reason: `Just after you wake at ${formatClock(s.schedule.wakeTime)}, before the day starts asking things of you.`,
      flexible: true,
    });
    if (weekendShift) {
      slots.push({
        key: "wake-weekend",
        days: [6, 7],
        start: wake + weekendShift,
        maxDuration: 10,
        techniques: [morningTech],
        priority: 5,
        context: "",
        reason: "Weekends start slower for you, so this sits later and stays flexible.",
        flexible: true,
      });
    }
  }

  // A midday reset for balanced/structured/hourly routines.
  if (style !== "light" && awake > 8 * 60) {
    const t = pick(["affirmations", "askfirmations", "inner_conversations", "meditation", "visualization"]);
    if (t) {
      slots.push({
        key: "midday",
        days: ALL_DAYS,
        start: wake + Math.round(awake / 2),
        maxDuration: 5,
        techniques: [t],
        priority: 4,
        context: "",
        reason: "A short pause in the middle of your waking hours.",
        flexible: true,
        optional: style === "balanced",
      });
    }
  }

  // Hourly touchpoints.
  if (style === "hourly") {
    const t = pick(["affirmations", "askfirmations", "inner_conversations"]) ?? allowed[0];
    if (t) {
      for (let m = wake + 90; m < wake + awake - 120; m += 120) {
        slots.push({
          key: `hour-${m}`,
          days: ALL_DAYS,
          start: m,
          maxDuration: 2,
          techniques: [t],
          priority: 3,
          context: "",
          reason: "A brief touchpoint — you asked for something through the day.",
          flexible: true,
        });
      }
    }
  }

  // Keep slots clear of unavailable activities and of each other.
  const blocked = s.schedule.commitments.filter((c) => c.start && c.end && c.manifestationOverlap.availability === "no");
  const chosen: { slot: Slot; start: number; duration: number }[] = [];
  const clashes = (slot: Slot, start: number, duration: number) =>
    slot.days.some((d) => {
      const iv = weekInterval(d, fromMinutes(start), duration);
      return (
        blocked.some((c) => c.weekdays.some((cd) => overlapMinutes(iv, spanInterval(cd, c.start!, c.end!)) > 0)) ||
        chosen.some((o) => o.slot.days.some((od) => overlapMinutes(iv, weekInterval(od, fromMinutes(o.start), o.duration + 5)) > 0))
      );
    });

  // 1. Pick slots by priority (a flexible slot may slide up to an hour to avoid a clash).
  const ordered = [...slots].sort((a, b) => b.priority - a.priority);
  const perSession = style === "light" ? 3 : 2;
  const maxSessions = style === "light" ? 3 : style === "hourly" ? 12 : 5;
  const fits = (slot: Slot, start: number, duration: number) => !clashes(slot, start, duration);
  for (const slot of ordered) {
    if (!slot.optional && chosen.filter((c) => !c.slot.optional).length >= maxSessions) continue;
    const provisional = Math.min(slot.maxDuration, perSession + 3);
    let start = slot.start;
    for (let tries = 0; tries < 4 && !fits(slot, start, provisional); tries++) start += 15;
    if (!fits(slot, start, provisional)) continue;
    chosen.push({ slot, start, duration: perSession });
  }

  // 2. Every required session gets a minimum; drop the lowest priority ones if that alone breaks the budget.
  const required = () => chosen.filter((c) => !c.slot.optional);
  while (required().length * perSession > max && required().length > 1) {
    const lowest = required().sort((a, b) => a.slot.priority - b.slot.priority)[0];
    chosen.splice(chosen.indexOf(lowest), 1);
  }

  // 3. Share the rest of the budget out by priority, within each slot's natural length.
  let spare = max - required().reduce((n, c) => n + c.duration, 0);
  const growable = () =>
    required()
      .filter((c) => c.duration < c.slot.maxDuration)
      .sort((a, b) => b.slot.priority - a.slot.priority);
  while (spare > 0) {
    const g = growable();
    if (!g.length) break;
    for (const c of g) {
      if (spare <= 0) break;
      const others = chosen.filter((o) => o !== c);
      const clear = c.slot.days.every((d) => {
        const iv = weekInterval(d, fromMinutes(c.start), c.duration + 1);
        return !others.some((o) => o.slot.days.some((od) => overlapMinutes(iv, weekInterval(od, fromMinutes(o.start), o.duration + 5)) > 0)) &&
          !blocked.some((b) => b.weekdays.some((bd) => overlapMinutes(iv, spanInterval(bd, b.start!, b.end!)) > 0));
      });
      if (!clear) {
        c.slot = { ...c.slot, maxDuration: c.duration };
        continue;
      }
      c.duration += 1;
      spare -= 1;
    }
  }
  // Optional extras stay short.
  for (const c of chosen) if (c.slot.optional) c.duration = Math.min(c.slot.maxDuration, 3);

  const sessions: AISession[] = chosen.map(({ slot, start, duration }) => {
    const t = slot.techniques[0];
    return {
      title: titleFor(t, slot.context),
      technique: t,
      customTechniqueLabel: t === "other" ? (s.techniques.otherLabel ?? "") : "",
      days: slot.days,
      startTime: fromMinutes(start),
      durationMinutes: duration,
      flexibleTiming: slot.flexible,
      optional: Boolean(slot.optional),
      recurrenceLabel: "",
      instructions: instructionsFor[t],
      ...contentFor(t, s),
      notes: slot.optional ? "Optional — skip it on busy days." : "",
      contextActivity: slot.context,
      fitReason: slot.reason,
    };
  });

  const desire = shortDesire(s);
  return {
    title: desire.length <= 60 ? `Your routine for ${softenFirstWord(desire)}` : "Your routine",
    explanation: `Built around ${s.schedule.commitments.length ? "the things already in your week" : "your waking hours"} and the methods you actually enjoy — nothing that asks your day to rearrange itself.`,
    philosophy: "These sessions are tools, not tests. Use what helps, skip what doesn't fit a given day, and come back whenever you like.",
    generatedAffirmations: s.affirmations.mode === "generate" ? affirmationsFor(s) : [],
    generatedAskfirmations: sessions.some((x) => x.technique === "askfirmations") ? askfirmationsFor(s) : [],
    patterns: patternsFor(s),
    sessions: sessions.length
      ? sessions
      : [
          {
            title: "A quiet minute",
            technique: allowed[0] ?? "meditation",
            customTechniqueLabel: "",
            days: ALL_DAYS,
            startTime: fromMinutes(wake + 15),
            durationMinutes: Math.min(5, max),
            flexibleTiming: true,
            optional: false,
            recurrenceLabel: "",
            instructions: instructionsFor[allowed[0] ?? "meditation"],
            ...contentFor(allowed[0] ?? "meditation", s),
            notes: "",
            contextActivity: "",
            fitReason: "A single, easy moment after you wake.",
          },
        ],
  };
}

function sessionToAI(x: Session, doc: PlanDoc): AISession {
  const lib = new Map(doc.affirmations.map((a) => [a.id, a.text]));
  const ask = new Map(doc.askfirmations.map((a) => [a.id, a.text]));
  return {
    title: x.title,
    technique: x.technique,
    customTechniqueLabel: x.customTechniqueLabel,
    days: x.days,
    startTime: x.startTime,
    durationMinutes: x.durationMinutes,
    flexibleTiming: x.flexibleTiming,
    optional: x.optional,
    recurrenceLabel: "",
    instructions: x.instructions,
    affirmations: x.affirmationIds.map((id) => lib.get(id) ?? "").filter(Boolean),
    askfirmations: x.askfirmationIds.map((id) => ask.get(id) ?? "").filter(Boolean),
    visualizationPrompt: x.visualizationPrompt,
    scriptingPrompt: x.scriptingPrompt,
    notes: x.notes,
    contextActivity: x.contextActivity,
    fitReason: x.fitReason,
  };
}

export const LOCAL_GENERATOR_MODEL = "assume-local-heuristic-v1";

export class LocalRoutineGenerator implements RoutineGenerator {
  readonly model = LOCAL_GENERATOR_MODEL;

  async createPlan({ snapshot }: { snapshot: IntakeSnapshotV2 }) {
    return buildLocalPlan(snapshot);
  }

  async adjustPlan({
    snapshot,
    current,
    pinned,
    adjustment,
  }: {
    snapshot: IntakeSnapshotV2;
    current: PlanDoc;
    pinned: Session[];
    adjustment: AdjustmentRequest;
  }) {
    const s: IntakeSnapshotV2 = structuredClone(snapshot);
    if (adjustment.kinds.includes("remove_technique")) s.techniques.avoid.push(...adjustment.removeTechniques);
    if (adjustment.kinds.includes("fewer_affirmations") && s.affirmations.mode !== "own") s.techniques.avoid.push("affirmations");
    if (adjustment.kinds.includes("more_affirmations") && s.affirmations.mode !== "none") s.techniques.love.unshift("affirmations");
    if (adjustment.kinds.includes("lighter")) {
      s.intensity.style = "light";
      s.intensity.minutesPerDay = [Math.max(3, Math.round(s.intensity.minutesPerDay[0] / 2)), Math.max(5, Math.round((s.intensity.minutesPerDay[1] ?? 30) * 0.6))];
    }
    if (adjustment.kinds.includes("more_structured") && s.intensity.style === "light") s.intensity.style = "structured";
    const pinnedMinutes = Math.max(0, ...[1, 2, 3, 4, 5, 6, 7].map((d) => pinned.filter((p) => !p.optional && p.days.includes(d as Weekday)).reduce((n, p) => n + p.durationMinutes, 0)));
    const [lo, hi] = s.intensity.minutesPerDay;
    s.intensity.minutesPerDay = [Math.max(0, lo - pinnedMinutes), hi === null ? null : Math.max(2, hi - pinnedMinutes)];
    const plan = buildLocalPlan(s);
    const noon = 12 * 60;
    const evening = 18 * 60;
    plan.sessions = plan.sessions.filter((x) => {
      const m = toMinutes(x.startTime);
      if (adjustment.kinds.includes("less_morning") && m < noon) return false;
      if (adjustment.kinds.includes("less_evening") && m >= evening && x.technique !== "sats") return false;
      return true;
    });
    // Stay clear of pinned sessions.
    plan.sessions = plan.sessions.filter(
      (x) =>
        !pinned.some((p) =>
          p.days.some((d) =>
            (x.days as Weekday[]).some(
              (e) => overlapMinutes(weekInterval(d, p.startTime, p.durationMinutes + 5), weekInterval(e, x.startTime, x.durationMinutes)) > 0,
            ),
          ),
        ),
    );
    if (!plan.sessions.length && !pinned.length) plan.sessions = buildLocalPlan(snapshot).sessions.slice(0, 1);
    plan.title = current.title;
    return plan;
  }

  async regenerateSession({ snapshot, current, session }: { snapshot: IntakeSnapshotV2; current: PlanDoc; session: Session }) {
    const allowed = allowedTechniques(snapshot);
    const alternatives = allowed.filter((t) => t !== session.technique && t !== "sats" && (!session.contextActivity || AUDIO.includes(t)));
    const t = alternatives[0] ?? session.technique;
    const base = sessionToAI(session, current);
    return {
      ...base,
      title: titleFor(t, session.contextActivity),
      technique: t,
      customTechniqueLabel: t === "other" ? (snapshot.techniques.otherLabel ?? "") : "",
      instructions: instructionsFor[t],
      ...contentFor(t, snapshot),
      notes: "",
    } satisfies AISession;
  }
}

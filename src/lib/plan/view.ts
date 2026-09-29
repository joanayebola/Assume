import { techniqueInfo } from "@/content/intake";
import type { Technique, Weekday } from "@/lib/intake/model";

import { minutesByDay, type PlanDoc, type Session } from "./schema";
import { toMinutes } from "./time";

/** Presentation helpers for the plan screen (pure, shared by server + client). */

export const WEEK: { day: Weekday; short: string; long: string }[] = [
  { day: 1, short: "Mon", long: "Monday" },
  { day: 2, short: "Tue", long: "Tuesday" },
  { day: 3, short: "Wed", long: "Wednesday" },
  { day: 4, short: "Thu", long: "Thursday" },
  { day: 5, short: "Fri", long: "Friday" },
  { day: 6, short: "Sat", long: "Saturday" },
  { day: 7, short: "Sun", long: "Sunday" },
];

/** ISO weekday "today" in the plan's timezone. */
export function todayIn(timezone: string, now = new Date()): Weekday {
  let name = "Mon";
  try {
    name = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(now);
  } catch {
    name = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(now);
  }
  return (WEEK.find((w) => w.short === name)?.day ?? 1) as Weekday;
}

export function sessionsOn(doc: PlanDoc, day: Weekday): Session[] {
  return doc.sessions
    .filter((s) => s.days.includes(day))
    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
}

export function dayMinutes(doc: PlanDoc) {
  return minutesByDay(doc);
}

export function techniqueLabel(s: Pick<Session, "technique" | "customTechniqueLabel">) {
  if (s.technique === "other" && s.customTechniqueLabel) return s.customTechniqueLabel;
  return techniqueInfo[s.technique].label.replace(" / quiet assumption", "");
}

/**
 * Visual family per technique: spoken/audio (accent), still/eyes-closed
 * (ink), writing (outlined). Few variants keep the week readable.
 */
export type TechniqueTone = "spoken" | "still" | "writing";
const tones: Record<Technique, TechniqueTone> = {
  affirmations: "spoken",
  askfirmations: "spoken",
  subliminals: "spoken",
  inner_conversations: "spoken",
  visualization: "still",
  sats: "still",
  meditation: "still",
  revision: "still",
  scripting: "writing",
  other: "writing",
};
export const toneOf = (t: Technique) => tones[t];

export const toneClasses: Record<TechniqueTone, string> = {
  spoken: "bg-accent text-ink border-ink",
  still: "bg-ink text-surface border-ink",
  writing: "bg-surface text-ink border-ink",
};

export function formatMinutes(n: number) {
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export function dailyEstimate(doc: PlanDoc) {
  const values = Object.values(minutesByDay(doc)).filter((v) => v > 0);
  if (!values.length) return "No sessions yet";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? `About ${formatMinutes(max)} a day` : `${min}–${formatMinutes(max)} a day`;
}

export function recurrenceText(s: Session) {
  switch (s.recurrence) {
    case "daily":
      return "Every day";
    case "weekdays":
      return "Weekdays";
    case "weekends":
      return "Weekends";
    default:
      return WEEK.filter((w) => s.days.includes(w.day))
        .map((w) => w.short)
        .join(", ");
  }
}

import type { Weekday } from "@/lib/intake/model";

/**
 * Week-aware time arithmetic. Everything is expressed as minutes from
 * Monday 00:00 ("week minutes", 0..10079) so overnight shifts and
 * past-midnight bedtimes work without special cases.
 */

export const DAY = 1440;
export const WEEK = DAY * 7;

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(total: number): string {
  const m = ((Math.round(total) % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export type Interval = { start: number; end: number }; // week minutes, end may exceed WEEK

export function weekInterval(day: Weekday, startHHMM: string, durationMinutes: number): Interval {
  const start = (day - 1) * DAY + toMinutes(startHHMM);
  return { start, end: start + durationMinutes };
}

/** A daily span on `day` from start → end; end ≤ start means it runs past midnight. */
export function spanInterval(day: Weekday, startHHMM: string, endHHMM: string): Interval {
  const s = toMinutes(startHHMM);
  let e = toMinutes(endHHMM);
  if (e <= s) e += DAY;
  const start = (day - 1) * DAY + s;
  return { start, end: start + (e - s) };
}

/** Overlap in minutes between two week intervals, accounting for the Sunday→Monday wrap. */
export function overlapMinutes(a: Interval, b: Interval): number {
  let best = 0;
  for (const shift of [-WEEK, 0, WEEK]) {
    const s = Math.max(a.start, b.start + shift);
    const e = Math.min(a.end, b.end + shift);
    best = Math.max(best, e - s);
  }
  return best;
}

/** Is [start, start+dur) fully inside the awake window wake→sleep (sleep may be after midnight)? */
export function withinAwakeWindow(
  day: Weekday,
  startHHMM: string,
  durationMinutes: number,
  wakeHHMM: string,
  sleepHHMM: string,
  allowAfterSleep = 0,
): boolean {
  const session = weekInterval(day, startHHMM, durationMinutes);
  // An awake window can start on this day or the previous day (overnight schedules).
  for (const d of [day, day === 1 ? 7 : day - 1] as Weekday[]) {
    const awake = spanInterval(d, wakeHHMM, sleepHHMM);
    awake.end += allowAfterSleep;
    for (const shift of [-WEEK, 0, WEEK]) {
      if (session.start >= awake.start + shift && session.end <= awake.end + shift) return true;
    }
  }
  return false;
}

/** Minutes between a time and the next occurrence of a target time (0..1439). */
export function minutesUntil(fromHHMM: string, toHHMM: string): number {
  return (((toMinutes(toHHMM) - toMinutes(fromHHMM)) % DAY) + DAY) % DAY;
}

export function awakeLengthMinutes(wakeHHMM: string, sleepHHMM: string): number {
  const d = minutesUntil(wakeHHMM, sleepHHMM);
  return d === 0 ? DAY : d;
}

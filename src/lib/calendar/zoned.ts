import type { Weekday } from "@/lib/intake/model";

/**
 * Wall-clock ↔ instant conversion for IANA timezones, using only Intl.
 *
 * Routine sessions are stored as wall-clock times ("07:30") in the plan's
 * timezone. Anything that needs a real instant (Today, calendar UNTIL,
 * next-session) converts here, so DST is handled in one place:
 *
 *  • Non-existent local times (spring-forward gap) resolve using the offset
 *    in force *before* the gap, so 02:30 becomes 03:30 — the RFC 5545 rule,
 *    which is also what Apple and Google Calendar do.
 *  • Ambiguous local times (fall-back overlap) resolve to the *first*
 *    occurrence, also per RFC 5545.
 */

/** Local calendar date, "YYYY-MM-DD". */
export type LocalDate = string;
/** Local wall time, "HH:MM". */
export type LocalTime = string;

const MINUTE = 60_000;
const DAY_MS = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Falls back to UTC for unknown zones rather than throwing mid-render. */
export function safeTimeZone(timeZone: string | null | undefined): string {
  return timeZone && isValidTimeZone(timeZone) ? timeZone : "UTC";
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsAt(timeZone: string, ms: number): Parts {
  const out: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(ms))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return { year: out.year, month: out.month, day: out.day, hour: out.hour % 24, minute: out.minute, second: out.second };
}

/** UTC offset in minutes at an instant (e.g. +60 for BST, −240 for EDT). */
export function offsetMinutes(timeZone: string, ms: number): number {
  const p = partsAt(timeZone, ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / MINUTE);
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function parseDate(date: LocalDate): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

export function formatLocalDate(year: number, month: number, day: number): LocalDate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function isLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { year, month, day } = parseDate(value);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const { year, month, day } = parseDate(date);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return formatLocalDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** ISO weekday (Mon = 1 … Sun = 7) of a local date. */
export function weekdayOf(date: LocalDate): Weekday {
  const { year, month, day } = parseDate(date);
  const js = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (((js + 6) % 7) + 1) as Weekday;
}

export function daysBetween(from: LocalDate, to: LocalDate): number {
  const a = parseDate(from);
  const b = parseDate(to);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY_MS);
}

function localMs(date: LocalDate, time: LocalTime, seconds = 0): number {
  const { year, month, day } = parseDate(date);
  const [h, m] = time.split(":").map(Number);
  return Date.UTC(year, month - 1, day, h, m, seconds);
}

/** The instant a wall-clock time happens in `timeZone` (see DST rules above). */
export function zonedToUtc(date: LocalDate, time: LocalTime, timeZone: string, seconds = 0): number {
  const local = localMs(date, time, seconds);
  const before = offsetMinutes(timeZone, local - DAY_MS);
  const after = offsetMinutes(timeZone, local + DAY_MS);
  const valid: number[] = [];
  for (const o of new Set([before, after])) {
    const t = local - o * MINUTE;
    if (offsetMinutes(timeZone, t) === o) valid.push(t);
  }
  if (valid.length) return Math.min(...valid); // overlap → first occurrence
  return local - before * MINUTE; // gap → shift forward by the gap length
}

export type ZonedMoment = { date: LocalDate; time: LocalTime; weekday: Weekday; minutes: number };

/** Wall-clock date/time of an instant in `timeZone`. */
export function utcToZoned(ms: number, timeZone: string): ZonedMoment {
  const p = partsAt(timeZone, ms);
  const date = formatLocalDate(p.year, p.month, p.day);
  return { date, time: `${pad(p.hour)}:${pad(p.minute)}`, weekday: weekdayOf(date), minutes: p.hour * 60 + p.minute };
}

export function todayIn(timeZone: string, now = Date.now()): LocalDate {
  return utcToZoned(now, timeZone).date;
}

/** [start, end) instants of a local calendar day — 23 or 25 hours long on DST days. */
export function dayBounds(date: LocalDate, timeZone: string): { start: number; end: number } {
  return { start: zonedToUtc(date, "00:00", timeZone), end: zonedToUtc(addDays(date, 1), "00:00", timeZone) };
}

/** Short zone label for display, e.g. "BST", "GMT+1", "EDT". */
export function zoneAbbreviation(timeZone: string, ms = Date.now()): string {
  const name = (locale: string) =>
    new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "short" })
      .formatToParts(new Date(ms))
      .find((p) => p.type === "timeZoneName")?.value;
  try {
    // en-US only abbreviates American zones; en-GB knows BST, CEST…
    const us = name("en-US");
    if (us && !us.startsWith("GMT")) return us;
    return name("en-GB") ?? us ?? timeZone;
  } catch {
    return timeZone;
  }
}

/** "London", "New York", "Ho Chi Minh" — the city part of an IANA name. */
export function zoneCity(timeZone: string): string {
  if (timeZone === "UTC" || timeZone === "Etc/UTC") return "UTC";
  return (timeZone.split("/").pop() ?? timeZone).replace(/_/g, " ");
}

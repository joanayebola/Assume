import type { Weekday } from "@/lib/intake/model";

import type { Recurrence } from "./model";
import { addDays, utcToZoned, weekdayOf, zonedToUtc, type LocalDate, type LocalTime } from "./zoned";

const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/** Basic-format UTC timestamp, e.g. 20261231T235959Z. */
export function icsUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * RFC 5545 RRULE value (without the "RRULE:" prefix).
 * With a TZID'd DTSTART, UNTIL must be UTC: we use the last second of the
 * end date in the event's timezone, so a 23:50 session on that day counts.
 */
export function rruleFor(r: Recurrence, timeZone: string): string {
  const parts = [`FREQ=${r.freq}`];
  if (r.freq === "WEEKLY") parts.push(`BYDAY=${r.byDay.map((d) => BYDAY[d - 1]).join(",")}`);
  if (r.until) parts.push(`UNTIL=${icsUtc(zonedToUtc(addDays(r.until, 1), "00:00", timeZone) - 1000)}`);
  return parts.join(";");
}

export type Occurrence = { start: number; end: number; date: LocalDate };

/**
 * Instants at which a weekly wall-clock session happens within [from, to).
 * `date` is the local date (in `timeZone`) the occurrence belongs to.
 */
export function occurrencesBetween(
  s: { days: Weekday[]; startTime: LocalTime; durationMinutes: number },
  timeZone: string,
  from: number,
  to: number,
  range: { startDate?: LocalDate | null; endDate?: LocalDate | null } = {},
): Occurrence[] {
  const out: Occurrence[] = [];
  const last = utcToZoned(to, timeZone).date;
  for (let date = addDays(utcToZoned(from, timeZone).date, -1); date <= addDays(last, 1); date = addDays(date, 1)) {
    if (!s.days.includes(weekdayOf(date))) continue;
    if (range.startDate && date < range.startDate) continue;
    if (range.endDate && date > range.endDate) continue;
    const start = zonedToUtc(date, s.startTime, timeZone);
    if (start >= from && start < to) out.push({ start, end: start + s.durationMinutes * 60_000, date });
  }
  return out;
}

import { formatClock } from "@/lib/intake/format";

import { addDays, parseDate, todayIn, utcToZoned, zoneCity, type LocalDate } from "./zoned";

/** Display helpers that always take an explicit timezone — never the server's. */

/** "7:30am" in `timeZone`. */
export function clockAt(ms: number, timeZone: string) {
  return formatClock(utcToZoned(ms, timeZone).time);
}

/** "Tue 29 Sep" for a local date (no timezone maths involved). */
export function shortDate(date: LocalDate) {
  const { year, month, day } = parseDate(date);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

/** "Tuesday 29 September". */
export function longDate(date: LocalDate) {
  const { year, month, day } = parseDate(date);
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

/** "Today", "Tomorrow" or "Thu 1 Oct" for an instant, in `timeZone`. */
export function relativeDay(ms: number, timeZone: string, now = Date.now()) {
  const date = utcToZoned(ms, timeZone).date;
  const today = todayIn(timeZone, now);
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return shortDate(date);
}

/** "Today · 7:30am" */
export function whenLabel(ms: number, timeZone: string, now = Date.now()) {
  return `${relativeDay(ms, timeZone, now)} · ${clockAt(ms, timeZone)}`;
}

/** "3 Oct" from an ISO instant, in `timeZone`. */
export function dayMonth(iso: string, timeZone: string) {
  return shortDate(utcToZoned(Date.parse(iso), timeZone).date).replace(/^\w+ /, "");
}

export { zoneCity };

import type { CalendarEvent } from "./model";
import { icsUtc, rruleFor } from "./recurrence";
import { offsetMinutes, parseDate, zoneAbbreviation, type LocalDate, type LocalTime } from "./zoned";

/**
 * RFC 5545 (iCalendar) serialisation.
 *
 * Events use `DTSTART;TZID=<IANA>` wall-clock times plus a generated
 * VTIMEZONE, so recurring sessions keep their local time across DST in Apple
 * Calendar, Google Calendar, Outlook and Thunderbird alike.
 */

const PRODID = "-//Assume//Manifestation routines//EN";
const WEEK_MS = 7 * 86_400_000;
const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** Escape a TEXT value (RFC 5545 §3.3.11). */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

const encoder = new TextEncoder();

/** Fold a content line at 75 octets without splitting a UTF-8 character (§3.1). */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function icsLocal(date: LocalDate, time: LocalTime): string {
  return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}${String(abs % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// VTIMEZONE
// ---------------------------------------------------------------------------

type Transition = { at: number; from: number; to: number };

/** Offset changes in [from, to), located to the minute. */
export function findTransitions(timeZone: string, from: number, to: number): Transition[] {
  const out: Transition[] = [];
  let prevT = from;
  let prevO = offsetMinutes(timeZone, from);
  for (let t = from + WEEK_MS; t <= to + WEEK_MS; t += WEEK_MS) {
    const o = offsetMinutes(timeZone, t);
    if (o !== prevO) {
      let lo = prevT;
      let hi = t;
      while (hi - lo > 1000) {
        const mid = lo + Math.floor((hi - lo) / 2);
        if (offsetMinutes(timeZone, mid) === prevO) lo = mid;
        else hi = mid;
      }
      // Transitions happen on whole minutes; hi is within a second after one.
      const at = Math.floor(hi / 60_000) * 60_000;
      if (at < to) out.push({ at, from: prevO, to: o });
    }
    prevT = t;
    prevO = o;
  }
  return out;
}

type RuleKey = { month: number; weekday: number; nth: number; last: boolean; hhmm: string };

function ruleKey(t: Transition): RuleKey & { year: number; local: string } {
  const local = new Date(t.at + t.from * 60_000); // wall clock before the change
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth() + 1;
  const d = local.getUTCDate();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const hhmm = `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
  const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return {
    year: y,
    month: m,
    weekday: (local.getUTCDay() + 6) % 7,
    nth: Math.ceil(d / 7),
    last: d + 7 > daysInMonth,
    hhmm,
    local: icsLocal(date, hhmm),
  };
}

/** A yearly RRULE if every transition follows one, else null (use RDATEs). */
function yearlyRule(keys: ReturnType<typeof ruleKey>[]): string | null {
  if (keys.length < 2) return null;
  const [a] = keys;
  const sameShape = keys.every(
    (k, i) => k.month === a.month && k.weekday === a.weekday && k.hhmm === a.hhmm && (i === 0 || k.year === keys[i - 1].year + 1),
  );
  if (!sameShape) return null;
  if (keys.every((k) => k.last)) return `FREQ=YEARLY;BYMONTH=${a.month};BYDAY=-1${BYDAY[a.weekday]}`;
  if (a.nth <= 4 && keys.every((k) => k.nth === a.nth)) return `FREQ=YEARLY;BYMONTH=${a.month};BYDAY=${a.nth}${BYDAY[a.weekday]}`;
  return null;
}

/**
 * VTIMEZONE covering `fromYear` onwards. Transitions are read from the
 * runtime's tz database for a window of years; zones that follow a yearly
 * rule get an RRULE so the definition stays right indefinitely.
 */
export function vtimezone(timeZone: string, fromYear: number, toYear: number): string[] {
  const start = Date.UTC(fromYear - 1, 0, 1);
  const end = Date.UTC(Math.max(toYear, fromYear) + 2, 0, 1);
  const transitions = findTransitions(timeZone, start, end);
  const lines = ["BEGIN:VTIMEZONE", `TZID:${timeZone}`, `X-LIC-LOCATION:${timeZone}`];

  if (transitions.length === 0) {
    const offset = formatOffset(offsetMinutes(timeZone, start));
    lines.push(
      "BEGIN:STANDARD",
      `TZOFFSETFROM:${offset}`,
      `TZOFFSETTO:${offset}`,
      `TZNAME:${escapeText(zoneAbbreviation(timeZone, start))}`,
      "DTSTART:19700101T000000",
      "END:STANDARD",
    );
  } else {
    const groups = new Map<string, Transition[]>();
    for (const t of transitions) {
      const key = `${t.from}|${t.to}|${zoneAbbreviation(timeZone, t.at)}`;
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    for (const [key, group] of groups) {
      const [from, to, name] = key.split("|");
      const kind = Number(to) > Number(from) ? "DAYLIGHT" : "STANDARD";
      const keys = group.map(ruleKey);
      const rule = yearlyRule(keys);
      lines.push(
        `BEGIN:${kind}`,
        `TZOFFSETFROM:${formatOffset(Number(from))}`,
        `TZOFFSETTO:${formatOffset(Number(to))}`,
        `TZNAME:${escapeText(name)}`,
        `DTSTART:${keys[0].local}`,
      );
      if (rule) lines.push(`RRULE:${rule}`);
      else if (keys.length > 1) lines.push(`RDATE:${keys.slice(1).map((k) => k.local).join(",")}`);
      lines.push(`END:${kind}`);
    }
  }
  lines.push("END:VTIMEZONE");
  return lines;
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export type IcsOptions = {
  /** DTSTAMP — when the file was made. */
  now: number;
  /** Bumped on every re-export so clients that honour SEQUENCE update in place. */
  sequence?: number;
};

function eventLines(e: CalendarEvent, { now, sequence = 0 }: IcsOptions): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${icsUtc(now)}`,
    `SEQUENCE:${sequence}`,
    `DTSTART;TZID=${e.timezone}:${icsLocal(e.start.date, e.start.time)}`,
    `DTEND;TZID=${e.timezone}:${icsLocal(e.end.date, e.end.time)}`,
    `RRULE:${rruleFor(e.recurrence, e.timezone)}`,
    `SUMMARY:${escapeText(e.title)}`,
  ];
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
  if (e.url) lines.push(`URL;VALUE=URI:${e.url}`);
  // Sessions often ride along with other activities (a commute, a walk), so
  // they shouldn't mark the person as busy. CLASS asks shared views to hide details.
  lines.push("TRANSP:TRANSPARENT", "CLASS:PRIVATE", "STATUS:CONFIRMED");
  if (e.reminderMinutes !== null) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(e.title)}`,
      e.reminderMinutes === 0 ? "TRIGGER:PT0M" : `TRIGGER:-PT${e.reminderMinutes}M`,
      "END:VALARM",
    );
  }
  lines.push("END:VEVENT");
  return lines;
}

export function buildIcs(events: CalendarEvent[], options: IcsOptions): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${PRODID}`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];

  const zones = new Map<string, { from: number; to: number }>();
  for (const e of events) {
    const fromYear = parseDate(e.start.date).year;
    const toYear = e.recurrence.until ? parseDate(e.recurrence.until).year : fromYear + 3;
    const z = zones.get(e.timezone);
    zones.set(e.timezone, { from: Math.min(z?.from ?? fromYear, fromYear), to: Math.max(z?.to ?? toYear, toYear) });
  }
  for (const [tz, { from, to }] of zones) lines.push(...vtimezone(tz, from, to));

  for (const e of events) lines.push(...eventLines(e, options));
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

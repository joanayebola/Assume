import ICAL from "ical.js";
import { describe, expect, it } from "vitest";

import { buildIcs, escapeText, foldLine, vtimezone } from "@/lib/calendar/ics";
import {
  buildEvents,
  DEFAULT_CALENDAR_PREFERENCES,
  exportFingerprint,
  exportOptionsSchema,
  PRIVATE_TITLE,
  VERY_PRIVATE_TITLE,
  type CalendarPreferences,
  type ExportOptions,
} from "@/lib/calendar/model";
import { occurrencesBetween, rruleFor } from "@/lib/calendar/recurrence";
import { addDays, dayBounds, utcToZoned, weekdayOf, zonedToUtc } from "@/lib/calendar/zoned";
import type { Weekday } from "@/lib/intake/model";
import { PLAN_DOC_VERSION, recurrenceFor, type PlanDoc, type Session } from "@/lib/plan/schema";

import { session } from "./support/plan";

const PLAN_ID = "11111111-2222-4333-8444-555555555555";
const SITE = "https://assume.example";
const NOW = Date.UTC(2026, 8, 28, 12, 0, 0);

function doc(sessions: Session[], timezone = "Europe/London", extra: Partial<PlanDoc> = {}): PlanDoc {
  return {
    docVersion: PLAN_DOC_VERSION,
    title: "SP routine",
    explanation: "",
    philosophy: "",
    manifestation: { id: null, desire: "Reconnect with J" },
    timezone,
    affirmations: [
      { id: "a1", text: "J texts me first, always.", source: "user" },
      { id: "a2", text: "We're closer than ever; it's easy.", source: "user" },
    ],
    askfirmations: [{ id: "q1", text: "Why is it so natural for us to talk?", source: "generated" }],
    patterns: [],
    sessions,
    ...extra,
  };
}

function opts(overrides: Partial<ExportOptions> = {}, prefs: Partial<CalendarPreferences> = {}): ExportOptions {
  return {
    excludedSessionIds: [],
    startDate: "2026-09-28",
    endDate: null,
    preferences: { ...DEFAULT_CALENDAR_PREFERENCES, ...prefs },
    ...overrides,
  };
}

const at = (days: Weekday[], startTime: string, durationMinutes = 5, extra: Partial<Session> = {}) =>
  session({ days, recurrence: recurrenceFor(days), startTime, durationMinutes, ...extra });

/** Expand our .ics with ical.js (an independent RFC 5545 implementation) → [uid, start ms][]. */
function expandWithIcalJs(ics: string, until: number) {
  const root = new ICAL.Component(ICAL.parse(ics));
  for (const tz of root.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);
  const out: { uid: string; start: number; end: number }[] = [];
  for (const vevent of root.getAllSubcomponents("vevent")) {
    const event = new ICAL.Event(vevent);
    const iter = event.iterator();
    for (let next = iter.next(); next && next.toUnixTime() * 1000 < until; next = iter.next()) {
      const { endDate } = event.getOccurrenceDetails(next);
      out.push({ uid: event.uid, start: next.toUnixTime() * 1000, end: endDate.toUnixTime() * 1000 });
    }
  }
  return out.sort((a, b) => a.start - b.start || a.uid.localeCompare(b.uid));
}

/** The same expansion using our own engine (what Today and "next session" use). */
function expandOurselves(d: PlanDoc, o: ExportOptions, until: number) {
  const out: { uid: string; start: number; end: number }[] = [];
  for (const e of buildEvents(d, { planId: PLAN_ID, options: o, siteUrl: SITE })) {
    const s = d.sessions.find((x) => x.id === e.sessionId)!;
    for (const occ of occurrencesBetween(s, d.timezone, 0, until, { startDate: o.startDate, endDate: o.endDate })) {
      out.push({ uid: e.uid, start: occ.start, end: occ.end });
    }
  }
  return out.sort((a, b) => a.start - b.start || a.uid.localeCompare(b.uid));
}

function roundTrip(d: PlanDoc, o: ExportOptions, weeks = 10) {
  const until = zonedToUtc(addDays(o.startDate, weeks * 7), "00:00", d.timezone);
  const ics = buildIcs(buildEvents(d, { planId: PLAN_ID, options: o, siteUrl: SITE }), { now: NOW });
  return { ics, theirs: expandWithIcalJs(ics, until), ours: expandOurselves(d, o, until) };
}

const localOf = (ms: number, tz: string) => {
  const z = utcToZoned(ms, tz);
  return `${z.date} ${z.time}`;
};

// ---------------------------------------------------------------------------

describe("zoned time", () => {
  it("resolves a spring-forward gap forward by the gap length (RFC 5545)", () => {
    // London: 01:00 → 02:00 on 29 Mar 2026, so 01:30 doesn't exist.
    const t = zonedToUtc("2026-03-29", "01:30", "Europe/London");
    expect(new Date(t).toISOString()).toBe("2026-03-29T01:30:00.000Z");
    expect(localOf(t, "Europe/London")).toBe("2026-03-29 02:30");
    // New York: 02:00 → 03:00 on 8 Mar 2026.
    expect(localOf(zonedToUtc("2026-03-08", "02:30", "America/New_York"), "America/New_York")).toBe("2026-03-08 03:30");
  });

  it("resolves a fall-back overlap to the first occurrence", () => {
    const t = zonedToUtc("2026-10-25", "01:30", "Europe/London");
    expect(new Date(t).toISOString()).toBe("2026-10-25T00:30:00.000Z"); // still BST
    const ny = zonedToUtc("2026-11-01", "01:30", "America/New_York");
    expect(new Date(ny).toISOString()).toBe("2026-11-01T05:30:00.000Z"); // still EDT
  });

  it("knows DST days are 23 and 25 hours long", () => {
    const h = (b: { start: number; end: number }) => (b.end - b.start) / 3_600_000;
    expect(h(dayBounds("2026-03-29", "Europe/London"))).toBe(23);
    expect(h(dayBounds("2026-10-25", "Europe/London"))).toBe(25);
    expect(h(dayBounds("2026-10-04", "Australia/Sydney"))).toBe(23);
    expect(h(dayBounds("2026-06-01", "Asia/Kolkata"))).toBe(24);
  });

  it("handles half- and quarter-hour offsets", () => {
    expect(new Date(zonedToUtc("2026-06-01", "07:30", "Asia/Kolkata")).toISOString()).toBe("2026-06-01T02:00:00.000Z");
    expect(new Date(zonedToUtc("2026-06-01", "07:30", "Asia/Kathmandu")).toISOString()).toBe("2026-06-01T01:45:00.000Z");
  });

  it("computes ISO weekdays", () => {
    expect(weekdayOf("2026-09-28")).toBe(1);
    expect(weekdayOf("2026-10-04")).toBe(7);
  });
});

describe("recurrence generation", () => {
  it("uses FREQ=DAILY for every day and WEEKLY+BYDAY otherwise", () => {
    expect(rruleFor({ freq: "DAILY", byDay: [1, 2, 3, 4, 5, 6, 7], until: null }, "UTC")).toBe("FREQ=DAILY");
    expect(rruleFor({ freq: "WEEKLY", byDay: [1, 2, 3, 4, 5], until: null }, "UTC")).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
    expect(rruleFor({ freq: "WEEKLY", byDay: [6, 7], until: null }, "UTC")).toBe("FREQ=WEEKLY;BYDAY=SA,SU");
  });

  it("writes UNTIL in UTC as the last second of the end date, local time", () => {
    // 31 Dec 2026 23:59:59 in New York (EST, −5) = 1 Jan 04:59:59Z
    expect(rruleFor({ freq: "DAILY", byDay: [1, 2, 3, 4, 5, 6, 7], until: "2026-12-31" }, "America/New_York")).toBe(
      "FREQ=DAILY;UNTIL=20270101T045959Z",
    );
  });

  const cases: { name: string; sessions: Session[]; tz: string; o?: Partial<ExportOptions> }[] = [
    { name: "daily", sessions: [at([1, 2, 3, 4, 5, 6, 7], "07:30", 3)], tz: "Europe/London" },
    { name: "selected weekdays", sessions: [at([2, 4], "13:00", 2)], tz: "America/New_York" },
    { name: "weekdays", sessions: [at([1, 2, 3, 4, 5], "08:15", 10)], tz: "Asia/Kolkata" },
    { name: "weekend-only", sessions: [at([6, 7], "09:00", 15)], tz: "Australia/Sydney" },
    {
      name: "hourly plan",
      sessions: Array.from({ length: 9 }, (_, i) => at([1, 2, 3, 4, 5], `${String(9 + i).padStart(2, "0")}:00`, 1)),
      tz: "Europe/Berlin",
    },
    { name: "crossing midnight", sessions: [at([5, 6], "23:50", 20)], tz: "America/Los_Angeles" },
    { name: "UTC", sessions: [at([1, 3, 5], "22:45", 5)], tz: "UTC" },
    { name: "negative half-hour offset", sessions: [at([1, 2, 3, 4, 5, 6, 7], "06:00", 5)], tz: "America/St_Johns" },
    {
      name: "through the October DST change",
      sessions: [at([1, 2, 3, 4, 5, 6, 7], "07:30", 3), at([1, 2, 3, 4, 5, 6, 7], "22:45", 5)],
      tz: "Europe/London",
      o: { startDate: "2026-10-12" },
    },
    { name: "through the March DST change", sessions: [at([1, 2, 3, 4, 5, 6, 7], "08:00", 3)], tz: "America/New_York", o: { startDate: "2027-02-22" } },
    { name: "southern-hemisphere DST", sessions: [at([7], "18:00", 10)], tz: "Australia/Sydney", o: { startDate: "2026-09-20" } },
    { name: "with an end date", sessions: [at([1, 3, 5], "07:00", 5)], tz: "Europe/London", o: { endDate: "2026-10-16" } },
  ];

  for (const c of cases) {
    it(`matches an independent RFC 5545 parser: ${c.name}`, () => {
      const d = doc(c.sessions, c.tz);
      const { theirs, ours } = roundTrip(d, opts(c.o));
      expect(ours.length).toBeGreaterThan(0);
      expect(theirs).toEqual(ours);
    });
  }

  // Sessions *inside* the transition hour. RFC 5545 §3.3.5: an ambiguous time
  // is its first occurrence; a non-existent one shifts forward by the gap.
  // ical.js deviates on exactly that one night (second occurrence / backward
  // shift), so compare every other occurrence and pin the RFC answer.
  const transitionNights = [
    { name: "fall-back overlap", tz: "Europe/London", time: "01:30", start: "2026-10-19", night: "2026-10-25", expectUtc: "2026-10-25T00:30:00.000Z" },
    { name: "spring-forward gap", tz: "America/New_York", time: "02:30", start: "2027-03-01", night: "2027-03-14", expectUtc: "2027-03-14T07:30:00.000Z" },
  ];
  for (const c of transitionNights) {
    it(`handles a session inside the ${c.name} hour`, () => {
      const d = doc([at([1, 2, 3, 4, 5, 6, 7], c.time, 10)], c.tz);
      const { theirs, ours } = roundTrip(d, opts({ startDate: c.start }), 4);
      const onNight = (o: { start: number }) => utcToZoned(o.start, c.tz).date === c.night;
      expect(theirs.filter((o) => !onNight(o))).toEqual(ours.filter((o) => !onNight(o)));
      expect(ours.filter(onNight).map((o) => new Date(o.start).toISOString())).toEqual([c.expectUtc]);
      expect(theirs.filter(onNight)).toHaveLength(1); // no duplicate, no missing occurrence
    });
  }

  it("keeps wall-clock time across DST (07:30 stays 07:30)", () => {
    const d = doc([at([1, 2, 3, 4, 5, 6, 7], "07:30")], "Europe/London");
    const { theirs } = roundTrip(d, opts({ startDate: "2026-10-20" }), 2);
    const locals = new Set(theirs.map((o) => localOf(o.start, "Europe/London").slice(11)));
    expect([...locals]).toEqual(["07:30"]);
    const utcHours = new Set(theirs.map((o) => new Date(o.start).getUTCHours()));
    expect(utcHours).toEqual(new Set([6, 7])); // BST then GMT
  });

  it("starts on the first real occurrence (DTSTART must match the rule)", () => {
    // 28 Sep 2026 is a Monday; a weekend-only session must start on Saturday 3 Oct.
    const [e] = buildEvents(doc([at([6, 7], "09:00")]), { planId: PLAN_ID, options: opts(), siteUrl: SITE });
    expect(e.start).toEqual({ date: "2026-10-03", time: "09:00" });
  });

  it("puts the end of a past-midnight session on the next day", () => {
    const [e] = buildEvents(doc([at([5], "23:50", 20)]), { planId: PLAN_ID, options: opts(), siteUrl: SITE });
    expect(e.start).toEqual({ date: "2026-10-02", time: "23:50" });
    expect(e.end).toEqual({ date: "2026-10-03", time: "00:10" });
  });

  it("includes an occurrence on the end date itself, late in the day", () => {
    const d = doc([at([1, 2, 3, 4, 5, 6, 7], "23:30", 10)], "America/New_York");
    const { theirs } = roundTrip(d, opts({ endDate: "2026-09-30" }));
    expect(theirs.map((o) => localOf(o.start, "America/New_York"))).toEqual([
      "2026-09-28 23:30",
      "2026-09-29 23:30",
      "2026-09-30 23:30",
    ]);
  });

  it("leaves out sessions that never happen inside the chosen dates", () => {
    // Mon–Wed only; the weekend session has no occurrence.
    const events = buildEvents(doc([at([1], "07:00"), at([6, 7], "09:00")]), {
      planId: PLAN_ID,
      options: opts({ endDate: "2026-09-30" }),
      siteUrl: SITE,
    });
    expect(events).toHaveLength(1);
  });

  it("honours deselected sessions", () => {
    const a = at([1], "07:00");
    const b = at([1], "08:00");
    const events = buildEvents(doc([a, b]), { planId: PLAN_ID, options: opts({ excludedSessionIds: [a.id] }), siteUrl: SITE });
    expect(events.map((e) => e.sessionId)).toEqual([b.id]);
  });
});

describe("privacy", () => {
  const s = at([1], "07:30", 3, {
    title: "SP affirmations",
    instructions: "Say them slowly, like it's done.",
    affirmationIds: ["a1", "a2"],
    askfirmationIds: ["q1"],
    visualizationPrompt: "J laughing at your joke, on the sofa.",
  });
  const build = (prefs: Partial<CalendarPreferences>) =>
    buildEvents(doc([s]), { planId: PLAN_ID, options: opts({}, prefs), siteUrl: SITE })[0];

  it("titles events by the chosen style", () => {
    expect(build({ titleStyle: "descriptive" }).title).toBe("SP affirmations");
    expect(build({ titleStyle: "private" }).title).toBe(PRIVATE_TITLE);
    expect(build({ titleStyle: "very_private" }).title).toBe(VERY_PRIVATE_TITLE);
    expect(build({ titleStyle: "custom", customTitle: "Gym" }).title).toBe("Gym");
  });

  it("puts nothing personal in the description by default", () => {
    const e = build({});
    expect(e.title).toBe(PRIVATE_TITLE);
    expect(e.description).toBe(`Open in Assume: ${SITE}/plans/${PLAN_ID}`);
    const ics = buildIcs([e], { now: NOW });
    expect(ics).not.toMatch(/SP affirmations|J texts|sofa|slowly/);
  });

  it("omits DESCRIPTION and URL entirely when no details are chosen", () => {
    const e = build({ include: { affirmations: false, instructions: false, visualization: false, link: false } });
    expect(e.description).toBeNull();
    const vevent = new ICAL.Component(ICAL.parse(buildIcs([e], { now: NOW }))).getFirstSubcomponent("vevent")!;
    expect(vevent.hasProperty("description")).toBe(false);
    expect(vevent.hasProperty("url")).toBe(false);
  });

  it("includes exactly the chosen details", () => {
    const e = build({ include: { affirmations: true, instructions: true, visualization: true, link: false } });
    expect(e.description).toContain("Say them slowly");
    expect(e.description).toContain("• J texts me first, always.");
    expect(e.description).toContain("• Why is it so natural for us to talk?");
    expect(e.description).toContain("Scene: J laughing");
    expect(e.description).not.toContain("Open in Assume");
  });

  it("escapes and folds text so parsers read it back exactly", () => {
    const e = build({ include: { affirmations: true, instructions: true, visualization: true, link: true }, titleStyle: "descriptive" });
    const ics = buildIcs([e], { now: NOW });
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const vevent = new ICAL.Component(ICAL.parse(ics)).getFirstSubcomponent("vevent")!;
    expect(vevent.getFirstPropertyValue("description")).toBe(e.description);
    expect(vevent.getFirstPropertyValue("summary")).toBe("SP affirmations");
  });

  it("marks events private and transparent (they don't block time)", () => {
    const ics = buildIcs([build({})], { now: NOW });
    expect(ics).toContain("CLASS:PRIVATE");
    expect(ics).toContain("TRANSP:TRANSPARENT");
  });

  it("requires a custom title when the custom style is chosen", () => {
    const parsed = exportOptionsSchema.safeParse(opts({}, { titleStyle: "custom", customTitle: "" }));
    expect(parsed.success).toBe(false);
  });

  it("rejects an end date before the start date", () => {
    expect(exportOptionsSchema.safeParse(opts({ endDate: "2026-09-01" })).success).toBe(false);
  });
});

describe("ics format", () => {
  it("is a well-formed VCALENDAR with CRLF line endings", () => {
    const ics = buildIcs(buildEvents(doc([at([1], "07:30")]), { planId: PLAN_ID, options: opts(), siteUrl: SITE }), { now: NOW });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    expect(ics).toContain(`UID:${PLAN_ID}-`);
    expect(ics).toContain("DTSTAMP:20260928T120000Z");
    expect(ics).toContain("DTSTART;TZID=Europe/London:20260928T073000");
    expect(ics).toContain("BEGIN:VALARM");
  });

  it("omits the alarm when reminders are off", () => {
    const ics = buildIcs(
      buildEvents(doc([at([1], "07:30")]), { planId: PLAN_ID, options: opts({}, { reminderMinutes: null }), siteUrl: SITE }),
      { now: NOW },
    );
    expect(ics).not.toContain("VALARM");
  });

  it("describes DST zones with yearly rules", () => {
    const london = vtimezone("Europe/London", 2026, 2027).join("\n");
    expect(london).toContain("DTSTART:20250330T010000"); // 01:00 GMT → 02:00 BST, to the minute
    expect(london).toContain("DTSTART:20251026T020000");
    expect(london).toContain("TZNAME:BST");
    expect(london).toContain("RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU");
    expect(london).toContain("RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU");
    const ny = vtimezone("America/New_York", 2026, 2027).join("\n");
    expect(ny).toContain("BYMONTH=3;BYDAY=2SU");
    expect(ny).toContain("BYMONTH=11;BYDAY=1SU");
  });

  it("describes zones without DST with a single fixed offset", () => {
    const tokyo = vtimezone("Asia/Tokyo", 2026, 2027).join("\n");
    expect(tokyo).toContain("TZOFFSETFROM:+0900");
    expect(tokyo).not.toContain("DAYLIGHT");
  });

  it("stays correct years after the start (rules, not a fixed list)", () => {
    const d = doc([at([1, 2, 3, 4, 5, 6, 7], "07:30")], "Europe/London");
    const ics = buildIcs(buildEvents(d, { planId: PLAN_ID, options: opts(), siteUrl: SITE }), { now: NOW });
    const until = Date.UTC(2031, 11, 31);
    const late = expandWithIcalJs(ics, until).filter((o) => o.start > Date.UTC(2031, 0, 1));
    expect(late.length).toBeGreaterThan(300);
    expect(new Set(late.map((o) => localOf(o.start, "Europe/London").slice(11)))).toEqual(new Set(["07:30"]));
  });

  it("escapes special characters", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("never splits a multi-byte character when folding", () => {
    const folded = foldLine(`SUMMARY:${"✨".repeat(40)}`);
    for (const part of folded.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(`SUMMARY:${"✨".repeat(40)}`);
  });
});

describe("change detection", () => {
  const base = [at([1, 2, 3, 4, 5], "07:30", 3), at([6, 7], "10:00", 10)];
  const fp = (d: PlanDoc, o = opts()) => exportFingerprint(buildEvents(d, { planId: PLAN_ID, options: o, siteUrl: SITE }));

  it("is stable for the same routine and settings", () => {
    expect(fp(doc(base))).toBe(fp(doc(base)));
  });

  it("ignores the start date (re-opening the sheet later isn't a change)", () => {
    expect(fp(doc(base), opts({ startDate: "2026-10-05" }))).toBe(fp(doc(base)));
  });

  it("changes when a session is edited, added or removed", () => {
    const original = fp(doc(base));
    expect(fp(doc([{ ...base[0], startTime: "07:45" }, base[1]]))).not.toBe(original);
    expect(fp(doc([base[0], { ...base[1], days: [6] as Weekday[] }]))).not.toBe(original);
    expect(fp(doc([...base, at([3], "12:00")]))).not.toBe(original);
    expect(fp(doc([base[0]]))).not.toBe(original);
  });

  it("changes when privacy settings change", () => {
    expect(fp(doc(base), opts({}, { titleStyle: "very_private" }))).not.toBe(fp(doc(base)));
  });

  it("changes when the routine's timezone changes, and times follow the new zone", () => {
    const london = doc(base, "Europe/London");
    const ny = doc(base, "America/New_York");
    expect(fp(ny)).not.toBe(fp(london));
    const [e] = buildEvents(ny, { planId: PLAN_ID, options: opts(), siteUrl: SITE });
    expect(e.timezone).toBe("America/New_York");
    expect(e.start.time).toBe("07:30");
  });

  it("ignores changes that don't reach the calendar", () => {
    const d = doc(base);
    const withNotes = doc([{ ...base[0], notes: "private note", fitReason: "different" }, base[1]]);
    expect(fp(withNotes)).toBe(fp(d));
  });
});

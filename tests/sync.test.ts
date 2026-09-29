import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decryptToken, encryptToken } from "@/lib/calendar/crypto";
import { DemoCalendarStore } from "@/lib/calendar/demo-store";
import { googleEventId, GOOGLE_SCOPE, hasCalendarScope, toGoogleEvent } from "@/lib/calendar/google";
import { buildEvents, DEFAULT_CALENDAR_PREFERENCES, exportFingerprint, type CalendarEvent, type ExportOptions } from "@/lib/calendar/model";
import { disconnectGoogle, GoogleReconnectError, removePlanFromGoogle, syncPlanToGoogle } from "@/lib/calendar/service";
import { isExportCurrent, planCalendarStatus } from "@/lib/calendar/status";
import { applySync, diffSync, type CalendarProviderClient, type ProviderErrorKind } from "@/lib/calendar/sync";
import { mutateDemo } from "@/lib/demo/store";
import type { Weekday } from "@/lib/intake/model";
import { applyEdit } from "@/lib/plan/edits";
import { PLAN_DOC_VERSION, recurrenceFor, type PlanDoc, type Session } from "@/lib/plan/schema";

import { officeWorker } from "./fixtures/users";
import { session } from "./support/plan";

const dir = mkdtempSync(path.join(tmpdir(), "assume-sync-"));
process.env.ASSUME_DEMO_DATA_DIR = dir;
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const PLAN_ID = "11111111-2222-4333-8444-555555555555";
const SITE = "https://assume.example";

const at = (days: Weekday[], startTime: string, extra: Partial<Session> = {}) =>
  session({ days, recurrence: recurrenceFor(days), startTime, durationMinutes: 5, ...extra });

function doc(sessions: Session[], timezone = "Europe/London"): PlanDoc {
  return {
    docVersion: PLAN_DOC_VERSION,
    title: "Routine",
    explanation: "",
    philosophy: "",
    manifestation: { id: null, desire: "Something personal" },
    timezone,
    affirmations: [],
    askfirmations: [],
    patterns: [],
    sessions,
  };
}

const options = (o: Partial<ExportOptions> = {}): ExportOptions => ({
  excludedSessionIds: [],
  startDate: "2026-09-28",
  endDate: null,
  preferences: DEFAULT_CALENDAR_PREFERENCES,
  ...o,
});

const events = (d: PlanDoc, o = options()) => buildEvents(d, { planId: PLAN_ID, options: o, siteUrl: SITE });

// ---------------------------------------------------------------------------
// A fake calendar provider for the pure diff/apply engine
// ---------------------------------------------------------------------------

class FakeProvider implements CalendarProviderClient {
  events = new Map<string, { event: CalendarEvent; deleted: boolean }>();
  calls: string[] = [];
  failNext: ProviderErrorKind | null = null;

  private maybeFail() {
    if (!this.failNext) return;
    const kind = this.failNext;
    this.failNext = null;
    throw Object.assign(new Error(kind), { kind });
  }
  async insert(event: CalendarEvent, id: string) {
    this.calls.push(`insert ${event.sessionId}`);
    this.maybeFail();
    if (this.events.has(id)) throw Object.assign(new Error("conflict"), { kind: "conflict" });
    this.events.set(id, { event, deleted: false });
    return id;
  }
  async update(event: CalendarEvent, id: string) {
    this.calls.push(`update ${event.sessionId}`);
    this.maybeFail();
    const e = this.events.get(id);
    if (!e || e.deleted) throw Object.assign(new Error("not_found"), { kind: "not_found" });
    this.events.set(id, { event, deleted: false });
    return id;
  }
  async remove(id: string) {
    this.calls.push(`remove`);
    this.maybeFail();
    const e = this.events.get(id);
    if (!e || e.deleted) throw Object.assign(new Error("not_found"), { kind: "not_found" });
    e.deleted = true;
  }
  live() {
    return [...this.events.values()].filter((e) => !e.deleted).map((e) => e.event);
  }
}

const classify = (e: unknown): ProviderErrorKind => ((e as { kind?: ProviderErrorKind }).kind ?? "other");
const idFor = (sid: string) => `id_${sid}`;

describe("sync diff", () => {
  it("creates everything the first time, then nothing when unchanged", async () => {
    const provider = new FakeProvider();
    const d = doc([at([1, 2, 3, 4, 5], "07:30"), at([6, 7], "09:00")]);
    const first = await applySync(diffSync(events(d), []), provider, idFor, classify);
    expect(first.created).toBe(2);
    const again = diffSync(events(d), first.links);
    expect(again.create.length + again.update.length + again.remove.length).toBe(0);
  });

  it("edits a changed session in place instead of duplicating it", async () => {
    const provider = new FakeProvider();
    const s = at([1, 2, 3, 4, 5], "07:30");
    const first = await applySync(diffSync(events(doc([s])), []), provider, idFor, classify);
    const edited = doc([{ ...s, startTime: "08:00" }]);
    const second = await applySync(diffSync(events(edited), first.links), provider, idFor, classify);
    expect(second).toMatchObject({ created: 0, updated: 1, removed: 0 });
    expect(provider.live()).toHaveLength(1);
    expect(provider.live()[0].start.time).toBe("08:00");
  });

  it("adds new sessions and removes deleted or deselected ones", async () => {
    const provider = new FakeProvider();
    const [a, b] = [at([1], "07:00"), at([2], "08:00")];
    const first = await applySync(diffSync(events(doc([a, b])), []), provider, idFor, classify);
    const c = at([3], "09:00");
    const next = await applySync(diffSync(events(doc([a, c]), options()), first.links), provider, idFor, classify);
    expect(next).toMatchObject({ created: 1, removed: 1 });
    expect(provider.live().map((e) => e.sessionId).sort()).toEqual([a.id, c.id].sort());
    const deselect = diffSync(events(doc([a, c]), options({ excludedSessionIds: [c.id] })), [...first.links.filter((l) => l.sessionId === a.id), ...next.links]);
    expect(deselect.remove.map((l) => l.sessionId)).toEqual([c.id]);
  });

  it("recreates an event the person deleted in their calendar", async () => {
    const provider = new FakeProvider();
    const s = at([1], "07:00");
    const first = await applySync(diffSync(events(doc([s])), []), provider, idFor, classify);
    provider.events.delete(idFor(s.id)); // gone from the calendar entirely
    const edited = doc([{ ...s, startTime: "07:15" }]);
    const second = await applySync(diffSync(events(edited), first.links), provider, idFor, classify);
    expect(second.failed).toEqual([]);
    expect(provider.live()).toHaveLength(1);
  });

  it("turns a retried insert into an update (no duplicate)", async () => {
    const provider = new FakeProvider();
    const s = at([1], "07:00");
    // An earlier attempt created the event but its link was never saved.
    await provider.insert(events(doc([s]))[0], idFor(s.id));
    const result = await applySync(diffSync(events(doc([s])), []), provider, idFor, classify);
    expect(result.failed).toEqual([]);
    expect(provider.live()).toHaveLength(1);
  });

  it("treats removing an already-deleted event as done", async () => {
    const provider = new FakeProvider();
    const s = at([1], "07:00");
    const first = await applySync(diffSync(events(doc([s])), []), provider, idFor, classify);
    provider.events.get(idFor(s.id))!.deleted = true;
    const result = await applySync(diffSync([], first.links), provider, idFor, classify);
    expect(result.removedSessionIds).toEqual([s.id]);
  });

  it("only records links for what succeeded, so a retry finishes the job", async () => {
    const provider = new FakeProvider();
    const d = doc([at([1], "07:00"), at([2], "08:00"), at([3], "09:00")]);
    provider.failNext = "other";
    const first = await applySync(diffSync(events(d), []), provider, idFor, classify);
    expect(first.failed).toHaveLength(1);
    expect(first.links).toHaveLength(2);
    const retry = await applySync(diffSync(events(d), first.links), provider, idFor, classify);
    expect(retry.created).toBe(1);
    expect(provider.live()).toHaveLength(3);
  });
});

describe("calendar status", () => {
  const record = (d: PlanDoc, provider: "ics" | "google" = "ics") => {
    const ev = events(d);
    return {
      planId: PLAN_ID,
      provider,
      options: options(),
      fingerprint: exportFingerprint(ev),
      planVersion: 1,
      eventCount: ev.length,
      exportCount: 1,
      lastExportedAt: "2026-09-28T10:00:00Z",
    };
  };

  it("notices an edited plan after export", () => {
    const d = doc([at([1, 2, 3, 4, 5], "07:30")]);
    const r = record(d);
    expect(isExportCurrent(d, PLAN_ID, r, SITE)).toBe(true);
    const { doc: edited } = applyEdit(d, {
      type: "update_session",
      id: d.sessions[0].id,
      session: { ...d.sessions[0], startTime: "07:45" },
    });
    expect(isExportCurrent(edited, PLAN_ID, r, SITE)).toBe(false);
  });

  it("notices a timezone change", () => {
    const d = doc([at([1], "07:30")]);
    const r = record(d);
    const { doc: moved } = applyEdit(d, { type: "set_timezone", timezone: "America/New_York" });
    expect(moved.timezone).toBe("America/New_York");
    expect(isExportCurrent(moved, PLAN_ID, r, SITE)).toBe(false);
  });

  it("flags Google exports whose connection was lost", () => {
    const d = doc([at([1], "07:30")]);
    const s = planCalendarStatus({ doc: d, planId: PLAN_ID, exports: [record(d, "google")], connection: null, siteUrl: SITE });
    expect(s.google?.state).toBe("needs_reconnect");
  });
});

describe("Google mapping", () => {
  it("builds a private, transparent recurring event in the plan's timezone", () => {
    const [e] = events(doc([at([6, 7], "09:00", { title: "SP affirmations" })], "America/New_York"));
    const body = toGoogleEvent(e, "abc12345");
    expect(body).toMatchObject({
      id: "abc12345",
      summary: "Manifestation session",
      start: { dateTime: "2026-10-03T09:00:00", timeZone: "America/New_York" },
      end: { dateTime: "2026-10-03T09:05:00", timeZone: "America/New_York" },
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=SA,SU"],
      transparency: "transparent",
      visibility: "private",
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 0 }] },
    });
    expect(JSON.stringify(body)).not.toContain("SP affirmations");
  });

  it("has no description key at all when there are no details", () => {
    const [e] = events(doc([at([1], "07:00")]), options({ preferences: { ...DEFAULT_CALENDAR_PREFERENCES, include: { affirmations: false, instructions: false, visualization: false, link: false } } }));
    expect("description" in toGoogleEvent(e)).toBe(false);
  });

  it("makes stable, valid event ids (base32hex, 5–1024 chars)", () => {
    const id = googleEventId("conn", PLAN_ID, "s_1");
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(googleEventId("conn", PLAN_ID, "s_1")).toBe(id);
    expect(googleEventId("conn", PLAN_ID, "s_2")).not.toBe(id);
  });

  it("checks the granted scope (people can untick it on the consent screen)", () => {
    expect(hasCalendarScope(`openid ${GOOGLE_SCOPE}`)).toBe(true);
    expect(hasCalendarScope("openid email")).toBe(false);
  });
});

describe("token encryption", () => {
  const key = "k".repeat(40);
  it("round-trips and never stores plaintext", () => {
    const sealed = encryptToken("1//refresh-token", key);
    expect(sealed).not.toContain("refresh");
    expect(decryptToken(sealed, key)).toBe("1//refresh-token");
    expect(encryptToken("same", key)).not.toBe(encryptToken("same", key)); // random IV
  });
  it("rejects tampering and wrong keys", () => {
    const sealed = encryptToken("secret", key);
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptToken(parts.join("."), key)).toThrow();
    expect(() => decryptToken(sealed, "x".repeat(40))).toThrow();
  });
});

// ---------------------------------------------------------------------------
// End to end: service + demo store + a fake Google REST API
// ---------------------------------------------------------------------------

type FakeGoogle = { calendars: Set<string>; events: Map<string, Record<string, unknown>>; revokedRefresh: boolean; requests: string[] };

function fakeGoogle(): FakeGoogle & { fetch: typeof fetch } {
  const g: FakeGoogle = { calendars: new Set(), events: new Map(), revokedRefresh: false, requests: [] };
  let calSeq = 0;
  const json = (status: number, body: unknown = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status });
  const impl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    g.requests.push(`${method} ${url.pathname}`);
    if (url.hostname === "oauth2.googleapis.com" && url.pathname === "/token") {
      if (g.revokedRefresh) return json(400, { error: "invalid_grant" });
      return json(200, { access_token: "access-2", expires_in: 3600, scope: GOOGLE_SCOPE });
    }
    if (url.pathname === "/revoke") return json(200);
    const m = url.pathname.match(/^\/calendar\/v3\/calendars(?:\/([^/]+))?(?:\/events(?:\/([^/]+))?)?$/);
    if (!m) return json(404);
    const cal = m[1] && decodeURIComponent(m[1]);
    const ev = m[2] && decodeURIComponent(m[2]);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (!cal && method === "POST") {
      const id = `cal${++calSeq}@group.calendar.google.com`;
      g.calendars.add(id);
      return json(200, { id });
    }
    if (cal && !g.calendars.has(cal)) return json(404, { error: { errors: [{ reason: "notFound" }] } });
    if (cal && !url.pathname.includes("/events")) {
      if (method === "DELETE") {
        g.calendars.delete(cal);
        return json(204);
      }
      return json(200, { id: cal });
    }
    const key = (id: string) => `${cal}/${id}`;
    if (method === "POST") {
      if (g.events.has(key(body.id))) return json(409, { error: { errors: [{ reason: "duplicate" }] } });
      g.events.set(key(body.id), body);
      return json(200, { id: body.id });
    }
    if (method === "PUT") {
      if (!g.events.has(key(ev!))) return json(404);
      g.events.set(key(ev!), { ...body, id: ev });
      return json(200, { id: ev });
    }
    if (method === "DELETE") {
      if (!g.events.delete(key(ev!))) return json(410);
      return json(204);
    }
    return json(404);
  };
  return Object.assign(g, { fetch: impl as typeof fetch });
}

describe("Google sync service (end to end)", () => {
  const USER = "user-google";
  const store = new DemoCalendarStore();
  let google: ReturnType<typeof fakeGoogle>;

  beforeEach(async () => {
    process.env.GOOGLE_CLIENT_ID = "client";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.CALENDAR_TOKEN_KEY = "t".repeat(40);
    google = fakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    const key = process.env.CALENDAR_TOKEN_KEY;
    await mutateDemo((s) => {
      s.connections = [];
      s.eventLinks = [];
      s.calendarExports = [];
      s.plans[PLAN_ID] = {
        id: PLAN_ID,
        userId: USER,
        intakeId: "i",
        manifestationId: "m",
        title: "Routine",
        status: "active",
        structure: "balanced",
        dailyMinutes: 5,
        doc: doc([]),
        version: 1,
        intake: officeWorker,
        generationModel: null,
        updatedAt: new Date().toISOString(),
      };
    });
    // An expired access token forces the refresh path.
    await store.saveConnection(USER, { calendarId: null, calendarName: "Assume", scope: GOOGLE_SCOPE }, {
      refreshToken: encryptToken("refresh-1", key),
      accessToken: encryptToken("access-1", key),
      accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const sync = (d: PlanDoc, o = options()) =>
    syncPlanToGoogle(store, { userId: USER, planId: PLAN_ID, doc: d, version: 1, options: o, siteUrl: SITE });

  it("refreshes the token, creates the Assume calendar and adds events", async () => {
    const result = await sync(doc([at([1, 2, 3, 4, 5], "07:30"), at([6, 7], "10:00")]));
    expect(result).toMatchObject({ created: 2, eventCount: 2, calendarName: "Assume" });
    expect(google.calendars.size).toBe(1);
    expect(google.events.size).toBe(2);
    expect(google.requests[0]).toBe("POST /token");
    const conn = await store.getSecrets(USER, "google");
    expect(decryptToken(conn!.secrets.accessToken!, process.env.CALENDAR_TOKEN_KEY!)).toBe("access-2");
    expect(await store.getExport(USER, PLAN_ID, "google")).toMatchObject({ eventCount: 2 });
  });

  it("re-syncing an edited plan updates in place — never duplicates", async () => {
    const s = at([1, 2, 3, 4, 5], "07:30");
    await sync(doc([s]));
    await sync(doc([s]));
    await sync(doc([{ ...s, startTime: "08:15" }]));
    expect(google.events.size).toBe(1);
    const [only] = [...google.events.values()] as { start: { dateTime: string } }[];
    expect(only.start.dateTime).toBe("2026-09-28T08:15:00");
  });

  it("recreates the calendar if the person deleted it in Google", async () => {
    await sync(doc([at([1], "07:30")]));
    google.calendars.clear();
    google.events.clear();
    await sync(doc([at([1], "07:30")]));
    expect(google.calendars.size).toBe(1);
    expect(google.events.size).toBe(1);
  });

  it("asks to reconnect when access was revoked, and changes nothing", async () => {
    google.revokedRefresh = true;
    await expect(sync(doc([at([1], "07:30")]))).rejects.toBeInstanceOf(GoogleReconnectError);
    expect(google.events.size).toBe(0);
    expect((await store.getConnection(USER, "google"))?.status).toBe("needs_reconnect");
  });

  it("removes a plan's events (pause/archive/delete) idempotently", async () => {
    await sync(doc([at([1], "07:30"), at([2], "07:30")]));
    expect(await removePlanFromGoogle(store, USER, PLAN_ID)).toBe(2);
    expect(google.events.size).toBe(0);
    expect(await store.getExport(USER, PLAN_ID, "google")).toBeNull();
    expect(await removePlanFromGoogle(store, USER, PLAN_ID)).toBe(0);
  });

  it("disconnects, optionally deleting the Assume calendar, and forgets tokens", async () => {
    await sync(doc([at([1], "07:30")]));
    const { calendarRemoved } = await disconnectGoogle(store, USER, true);
    expect(calendarRemoved).toBe(true);
    expect(google.calendars.size).toBe(0);
    expect(await store.getSecrets(USER, "google")).toBeNull();
    expect(await store.listLinks(USER, PLAN_ID, "google")).toEqual([]);
  });
});

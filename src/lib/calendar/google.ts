import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { CalendarEvent } from "./model";
import { rruleFor } from "./recurrence";

/**
 * Google Calendar over its REST API (OAuth 2.0 + Calendar API v3).
 *
 * Scope: calendar.app.created — Assume can create its own secondary calendar
 * and manage events *only on that calendar*. It can't read or change any
 * other calendar or event the person has.
 */

export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";

type Fetch = typeof fetch;

export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
}

/** The refresh token was revoked or expired — the person must reconnect. */
export class GoogleReconnectError extends Error {
  constructor(message = "Google Calendar needs to be reconnected") {
    super(message);
    this.name = "GoogleReconnectError";
  }
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export function pkcePair() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function authorizationUrl(p: { clientId: string; redirectUri: string; state: string; codeChallenge: string }) {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "offline",
    // Always show consent so Google issues a refresh token on reconnects too.
    prompt: "consent",
    include_granted_scopes: "false",
    state: p.state,
    code_challenge: p.codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export type TokenResponse = { accessToken: string; refreshToken: string | null; expiresAt: string; scope: string };

async function tokenRequest(body: Record<string, string>, fetchImpl: Fetch): Promise<TokenResponse> {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = String(json.error ?? res.status);
    if (code === "invalid_grant") throw new GoogleReconnectError();
    throw new GoogleApiError(res.status, code, `Token request failed: ${code}`);
  }
  return {
    accessToken: String(json.access_token),
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
    expiresAt: new Date(Date.now() + Number(json.expires_in ?? 3600) * 1000).toISOString(),
    scope: String(json.scope ?? ""),
  };
}

export function exchangeCode(
  env: { clientId: string; clientSecret: string },
  p: { code: string; verifier: string; redirectUri: string },
  fetchImpl: Fetch = fetch,
) {
  return tokenRequest(
    {
      grant_type: "authorization_code",
      code: p.code,
      code_verifier: p.verifier,
      redirect_uri: p.redirectUri,
      client_id: env.clientId,
      client_secret: env.clientSecret,
    },
    fetchImpl,
  );
}

export function refreshAccessToken(env: { clientId: string; clientSecret: string }, refreshToken: string, fetchImpl: Fetch = fetch) {
  return tokenRequest(
    { grant_type: "refresh_token", refresh_token: refreshToken, client_id: env.clientId, client_secret: env.clientSecret },
    fetchImpl,
  );
}

/** Best effort: revokes the grant so Assume disappears from the person's Google account. */
export async function revokeToken(token: string, fetchImpl: Fetch = fetch) {
  try {
    await fetchImpl(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Revocation is courtesy; the tokens are deleted on our side regardless.
  }
}

export function hasCalendarScope(granted: string) {
  return granted.split(/\s+/).includes(GOOGLE_SCOPE);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Deterministic Google event id (base32hex subset) so retries can't duplicate. */
export function googleEventId(connectionId: string, planId: string, sessionId: string) {
  return createHash("sha256").update(`${connectionId}:${planId}:${sessionId}`).digest("hex").slice(0, 40);
}

export type GoogleEventBody = {
  id?: string;
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  recurrence: string[];
  transparency: "transparent";
  visibility: "private";
  status: "confirmed";
  reminders: { useDefault: false; overrides: { method: "popup"; minutes: number }[] };
  source?: { title: string; url: string };
  extendedProperties: { private: Record<string, string> };
};

export function toGoogleEvent(e: CalendarEvent, id?: string): GoogleEventBody {
  return {
    ...(id ? { id } : {}),
    summary: e.title,
    ...(e.description ? { description: e.description } : {}),
    start: { dateTime: `${e.start.date}T${e.start.time}:00`, timeZone: e.timezone },
    end: { dateTime: `${e.end.date}T${e.end.time}:00`, timeZone: e.timezone },
    recurrence: [`RRULE:${rruleFor(e.recurrence, e.timezone)}`],
    transparency: "transparent",
    visibility: "private",
    status: "confirmed",
    reminders: { useDefault: false, overrides: e.reminderMinutes === null ? [] : [{ method: "popup", minutes: e.reminderMinutes }] },
    ...(e.url ? { source: { title: "Assume", url: e.url } } : {}),
    extendedProperties: { private: { assumePlan: e.planId, assumeSession: e.sessionId } },
  };
}

export class GoogleCalendarClient {
  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private async call<T>(method: string, path: string, body?: unknown, attempt = 0): Promise<T> {
    const res = await this.fetchImpl(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return (res.status === 204 ? undefined : await res.json().catch(() => undefined)) as T;

    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; errors?: { reason?: string }[] } };
    const reason = json.error?.errors?.[0]?.reason ?? String(res.status);
    // One polite retry for rate limits and transient server errors.
    const retryable = res.status === 429 || res.status >= 500 || reason === "rateLimitExceeded" || reason === "userRateLimitExceeded";
    if (retryable && attempt === 0) {
      await new Promise((r) => setTimeout(r, 800));
      return this.call<T>(method, path, body, 1);
    }
    throw new GoogleApiError(res.status, reason, json.error?.message ?? `Google Calendar request failed (${res.status})`);
  }

  async createCalendar(summary: string, timeZone: string): Promise<string> {
    const cal = await this.call<{ id: string }>("POST", "/calendars", { summary, timeZone, description: "Created by Assume." });
    return cal.id;
  }

  async calendarExists(calendarId: string): Promise<boolean> {
    try {
      await this.call("GET", `/calendars/${encodeURIComponent(calendarId)}`);
      return true;
    } catch (error) {
      if (error instanceof GoogleApiError && (error.status === 404 || error.status === 410)) return false;
      throw error;
    }
  }

  deleteCalendar(calendarId: string) {
    return this.call<void>("DELETE", `/calendars/${encodeURIComponent(calendarId)}`);
  }

  async insertEvent(calendarId: string, body: GoogleEventBody): Promise<string> {
    const ev = await this.call<{ id: string }>("POST", `/calendars/${encodeURIComponent(calendarId)}/events`, body);
    return ev.id;
  }

  async updateEvent(calendarId: string, eventId: string, body: GoogleEventBody): Promise<string> {
    const rest: Partial<GoogleEventBody> = { ...body };
    delete rest.id; // the id is in the URL; Google rejects a mismatched body id
    const ev = await this.call<{ id: string }>(
      "PUT",
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      rest,
    );
    return ev.id;
  }

  deleteEvent(calendarId: string, eventId: string) {
    return this.call<void>("DELETE", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
  }
}

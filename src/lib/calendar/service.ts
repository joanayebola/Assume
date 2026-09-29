import "server-only";

import { getGoogleCalendarEnv } from "@/lib/env";
import type { PlanDoc } from "@/lib/plan/schema";

import { decryptToken, encryptToken } from "./crypto";
import {
  exchangeCode,
  GoogleApiError,
  GoogleCalendarClient,
  googleEventId,
  GoogleReconnectError,
  hasCalendarScope,
  refreshAccessToken,
  revokeToken,
  toGoogleEvent,
} from "./google";
import { buildEvents, exportFingerprint, type ExportOptions } from "./model";
import { CalendarNotConfiguredError, type CalendarStore, type ConnectionInfo } from "./store";
import { applySync, diffSync, type ProviderErrorKind } from "./sync";
import { logError, logWarn } from "@/lib/log";

export const DEFAULT_GOOGLE_CALENDAR_NAME = "Assume";

function env() {
  const e = getGoogleCalendarEnv();
  if (!e) throw new CalendarNotConfiguredError("Google Calendar");
  return e;
}

const classify = (error: unknown): ProviderErrorKind => {
  if (error instanceof GoogleApiError) {
    if (error.status === 404 || error.status === 410) return "not_found";
    if (error.status === 409) return "conflict";
  }
  return "other";
};

const isAuthFailure = (error: unknown) =>
  error instanceof GoogleReconnectError || (error instanceof GoogleApiError && (error.status === 401 || error.reason === "authError"));

// ---------------------------------------------------------------------------
// Connect / session
// ---------------------------------------------------------------------------

export class GoogleScopeError extends Error {
  constructor() {
    super("Calendar permission wasn't granted");
    this.name = "GoogleScopeError";
  }
}

export async function connectGoogle(
  store: CalendarStore,
  userId: string,
  p: { code: string; verifier: string; redirectUri: string; timeZone: string },
): Promise<ConnectionInfo> {
  const e = env();
  const tokens = await exchangeCode(e, p);
  // Google lets people untick individual permissions on the consent screen.
  if (!hasCalendarScope(tokens.scope)) {
    await revokeToken(tokens.accessToken);
    throw new GoogleScopeError();
  }
  if (!tokens.refreshToken) throw new GoogleApiError(400, "no_refresh_token", "Google didn't return a refresh token");

  const client = new GoogleCalendarClient(tokens.accessToken);
  // Reconnecting reuses the calendar Assume already made, if it's still there.
  const previous = await store.getConnection(userId, "google");
  let calendarId = previous?.calendarId ?? null;
  if (calendarId && !(await client.calendarExists(calendarId))) calendarId = null;
  const calendarName = previous?.calendarName ?? DEFAULT_GOOGLE_CALENDAR_NAME;
  if (!calendarId) calendarId = await client.createCalendar(calendarName, p.timeZone);

  return store.saveConnection(
    userId,
    { calendarId, calendarName, scope: tokens.scope },
    {
      refreshToken: encryptToken(tokens.refreshToken, e.tokenKey),
      accessToken: encryptToken(tokens.accessToken, e.tokenKey),
      accessTokenExpiresAt: tokens.expiresAt,
    },
  );
}

async function googleSession(store: CalendarStore, userId: string) {
  const e = env();
  const found = await store.getSecrets(userId, "google");
  if (!found || found.connection.status === "needs_reconnect") throw new GoogleReconnectError("Google Calendar isn't connected");
  const { connection, secrets } = found;

  const fresh = secrets.accessToken && secrets.accessTokenExpiresAt && Date.parse(secrets.accessTokenExpiresAt) > Date.now() + 60_000;
  let accessToken: string;
  try {
    if (fresh && secrets.accessToken) {
      accessToken = decryptToken(secrets.accessToken, e.tokenKey);
    } else {
      const refreshed = await refreshAccessToken(e, decryptToken(secrets.refreshToken, e.tokenKey));
      accessToken = refreshed.accessToken;
      await store.updateSecrets(userId, connection.id, {
        accessToken: encryptToken(refreshed.accessToken, e.tokenKey),
        accessTokenExpiresAt: refreshed.expiresAt,
        ...(refreshed.refreshToken ? { refreshToken: encryptToken(refreshed.refreshToken, e.tokenKey) } : {}),
      });
    }
  } catch (error) {
    if (isAuthFailure(error) || (error instanceof Error && error.message.includes("Unrecognised token"))) {
      await store.updateConnection(userId, connection.id, { status: "needs_reconnect", lastError: "Access was revoked or expired" });
      throw new GoogleReconnectError();
    }
    throw error;
  }
  return { client: new GoogleCalendarClient(accessToken), connection };
}

async function ensureCalendar(store: CalendarStore, userId: string, client: GoogleCalendarClient, connection: ConnectionInfo, timeZone: string) {
  if (connection.calendarId && (await client.calendarExists(connection.calendarId))) return connection.calendarId;
  // The person deleted the Assume calendar in Google — make a fresh one.
  const calendarId = await client.createCalendar(connection.calendarName ?? DEFAULT_GOOGLE_CALENDAR_NAME, timeZone);
  await store.updateConnection(userId, connection.id, { calendarId });
  return calendarId;
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export type GoogleSyncResult = { created: number; updated: number; removed: number; eventCount: number; calendarName: string };

export class GooglePartialSyncError extends Error {
  constructor(readonly failed: number) {
    super(`${failed} calendar events couldn't be saved`);
    this.name = "GooglePartialSyncError";
  }
}

export async function syncPlanToGoogle(
  store: CalendarStore,
  p: { userId: string; planId: string; doc: PlanDoc; version: number; options: ExportOptions; siteUrl: string },
): Promise<GoogleSyncResult> {
  const { client, connection } = await googleSession(store, p.userId);
  const calendarId = await ensureCalendar(store, p.userId, client, connection, p.doc.timezone);

  const events = buildEvents(p.doc, { planId: p.planId, options: p.options, siteUrl: p.siteUrl });
  const diff = diffSync(events, await store.listLinks(p.userId, p.planId, "google"));
  const idFor = (sessionId: string) => googleEventId(connection.id, p.planId, sessionId);

  const result = await applySync(
    diff,
    {
      insert: (event, id) => client.insertEvent(calendarId, toGoogleEvent(event, id)),
      update: (event, externalId) => client.updateEvent(calendarId, externalId, toGoogleEvent(event)),
      remove: (externalId) => client.deleteEvent(calendarId, externalId),
    },
    idFor,
    classify,
  );

  // Record whatever succeeded, so a retry only redoes what failed.
  await store.upsertLinks(p.userId, p.planId, connection.id, "google", result.links);
  await store.deleteLinks(p.userId, p.planId, "google", result.removedSessionIds);

  if (result.failed.length) {
    if (result.failed.some((f) => isAuthFailure(f.error))) {
      await store.updateConnection(p.userId, connection.id, { status: "needs_reconnect", lastError: "Access was revoked" });
      throw new GoogleReconnectError();
    }
    logWarn("calendar:google", "partial sync", { failed: result.failed.length });
    throw new GooglePartialSyncError(result.failed.length);
  }

  await store.recordExport(p.userId, {
    planId: p.planId,
    provider: "google",
    options: p.options,
    fingerprint: exportFingerprint(events),
    planVersion: p.version,
    eventCount: events.length,
  });
  if (connection.lastError) await store.updateConnection(p.userId, connection.id, { lastError: null });

  return {
    created: result.created,
    updated: result.updated,
    removed: result.removed,
    eventCount: events.length,
    calendarName: connection.calendarName ?? DEFAULT_GOOGLE_CALENDAR_NAME,
  };
}

/** Delete every Google event for a plan (pause/archive/delete). Idempotent. */
export async function removePlanFromGoogle(store: CalendarStore, userId: string, planId: string): Promise<number> {
  const links = await store.listLinks(userId, planId, "google");
  if (!links.length) {
    await store.deleteExport(userId, planId, "google");
    return 0;
  }
  const { client, connection } = await googleSession(store, userId);
  const removed: string[] = [];
  for (const link of links) {
    try {
      if (connection.calendarId) await client.deleteEvent(connection.calendarId, link.externalId);
      removed.push(link.sessionId);
    } catch (error) {
      if (classify(error) === "not_found") removed.push(link.sessionId);
      else logError("calendar:google:remove", error);
    }
  }
  await store.deleteLinks(userId, planId, "google", removed);
  if (removed.length === links.length) await store.deleteExport(userId, planId, "google");
  return removed.length;
}

/**
 * Disconnect. Optionally deletes the Assume calendar (and so every event in
 * it) first. Local tokens are always removed, even if Google can't be reached.
 */
export async function disconnectGoogle(store: CalendarStore, userId: string, removeCalendar: boolean): Promise<{ calendarRemoved: boolean }> {
  const e = env();
  let calendarRemoved = false;
  const found = await store.getSecrets(userId, "google");
  if (!found) return { calendarRemoved: false };
  try {
    if (removeCalendar) {
      const { client, connection } = await googleSession(store, userId);
      if (connection.calendarId) {
        try {
          await client.deleteCalendar(connection.calendarId);
          calendarRemoved = true;
        } catch (error) {
          if (classify(error) === "not_found") calendarRemoved = true;
          else throw error;
        }
      }
    }
  } catch (error) {
    logError("calendar:google:disconnect", error);
  } finally {
    try {
      await revokeToken(decryptToken(found.secrets.refreshToken, e.tokenKey));
    } catch {
      // Undecryptable token — nothing to revoke.
    }
    await store.deleteConnection(userId, "google");
  }
  return { calendarRemoved };
}

export { GoogleReconnectError };

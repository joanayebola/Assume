import type { CalendarPreferences, CalendarProvider, ExportOptions } from "./model";

/**
 * Persistence contract for calendar state. Supabase and demo implementations
 * share it, like PlanStore.
 *
 * Token-bearing methods (`*Secrets`, links, connection writes) run with the
 * service role in Supabase — OAuth tokens are never readable by the user's
 * own session. Callers must pass a userId from a verified session.
 */

export type ExportRecord = {
  planId: string;
  provider: CalendarProvider;
  options: ExportOptions;
  fingerprint: string;
  planVersion: number;
  eventCount: number;
  exportCount: number;
  lastExportedAt: string;
};

export type ConnectionInfo = {
  id: string;
  provider: "google";
  status: "connected" | "needs_reconnect";
  calendarId: string | null;
  calendarName: string | null;
  scope: string;
  lastError: string | null;
  connectedAt: string;
};

/** Encrypted at rest (see src/lib/calendar/crypto.ts). */
export type ConnectionSecrets = {
  refreshToken: string;
  accessToken: string | null;
  accessTokenExpiresAt: string | null;
};

export type EventLinkRecord = {
  sessionId: string;
  externalId: string;
  fingerprint: string;
  syncedAt: string;
};

export interface CalendarStore {
  getPreferences(userId: string): Promise<CalendarPreferences>;
  savePreferences(userId: string, prefs: CalendarPreferences): Promise<void>;

  listExports(userId: string): Promise<ExportRecord[]>;
  getExport(userId: string, planId: string, provider: CalendarProvider): Promise<ExportRecord | null>;
  /** Upserts the latest export for (plan, provider) and bumps its count. */
  recordExport(userId: string, record: Omit<ExportRecord, "exportCount" | "lastExportedAt">): Promise<ExportRecord>;
  deleteExport(userId: string, planId: string, provider: CalendarProvider): Promise<void>;

  getConnection(userId: string, provider: "google"): Promise<ConnectionInfo | null>;

  // ---- privileged ----------------------------------------------------------
  saveConnection(
    userId: string,
    info: Pick<ConnectionInfo, "calendarId" | "calendarName" | "scope">,
    secrets: ConnectionSecrets,
  ): Promise<ConnectionInfo>;
  getSecrets(userId: string, provider: "google"): Promise<{ connection: ConnectionInfo; secrets: ConnectionSecrets } | null>;
  updateSecrets(userId: string, connectionId: string, secrets: Partial<ConnectionSecrets>): Promise<void>;
  updateConnection(
    userId: string,
    connectionId: string,
    patch: Partial<Pick<ConnectionInfo, "status" | "calendarId" | "calendarName" | "lastError">>,
  ): Promise<void>;
  /** Removes the connection, its secrets, every event link and every Google export record. */
  deleteConnection(userId: string, provider: "google"): Promise<void>;

  listLinks(userId: string, planId: string, provider: CalendarProvider): Promise<EventLinkRecord[]>;
  upsertLinks(userId: string, planId: string, connectionId: string, provider: CalendarProvider, links: EventLinkRecord[]): Promise<void>;
  deleteLinks(userId: string, planId: string, provider: CalendarProvider, sessionIds: string[]): Promise<void>;
}

export class CalendarNotConfiguredError extends Error {
  constructor(what: string) {
    super(`${what} is not configured`);
    this.name = "CalendarNotConfiguredError";
  }
}

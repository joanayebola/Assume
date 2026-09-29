import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json, Tables } from "@/types/database";

import { exportOptionsSchema, parsePreferences, type CalendarPreferences, type CalendarProvider } from "./model";
import {
  CalendarNotConfiguredError,
  type CalendarStore,
  type ConnectionInfo,
  type ConnectionSecrets,
  type EventLinkRecord,
  type ExportRecord,
} from "./store";

type Client = SupabaseClient<Database>;

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`[calendar:${context}] ${error?.message ?? "unknown error"}`);
}

function toExport(row: Tables<"calendar_exports">): ExportRecord | null {
  const options = exportOptionsSchema.safeParse(row.options);
  if (!options.success) return null;
  return {
    planId: row.plan_id,
    provider: row.provider,
    options: options.data,
    fingerprint: row.fingerprint,
    planVersion: row.plan_version,
    eventCount: row.event_count,
    exportCount: row.export_count,
    lastExportedAt: row.last_exported_at,
  };
}

function toConnection(row: Tables<"calendar_connections">): ConnectionInfo {
  return {
    id: row.id,
    provider: "google",
    status: row.status,
    calendarId: row.calendar_id,
    calendarName: row.calendar_name,
    scope: row.scope,
    lastError: row.last_error,
    connectedAt: row.connected_at,
  };
}

/**
 * `db` is the user's RLS-scoped client; `admin` (service role) is used only
 * for tokens and event links, always filtered by the verified user id.
 */
export class SupabaseCalendarStore implements CalendarStore {
  constructor(
    private readonly db: Client,
    private readonly adminClient: Client | null,
  ) {}

  private get admin(): Client {
    if (!this.adminClient) throw new CalendarNotConfiguredError("SUPABASE_SECRET_KEY");
    return this.adminClient;
  }

  async getPreferences(userId: string) {
    const { data, error } = await this.db.from("profiles").select("calendar_preferences").eq("id", userId).maybeSingle();
    if (error) fail("prefs:get", error);
    return parsePreferences(data?.calendar_preferences);
  }

  async savePreferences(userId: string, prefs: CalendarPreferences) {
    const { error } = await this.db
      .from("profiles")
      .update({ calendar_preferences: prefs as unknown as Json })
      .eq("id", userId);
    if (error) fail("prefs:save", error);
  }

  async listExports(userId: string) {
    const { data, error } = await this.db.from("calendar_exports").select("*").eq("user_id", userId);
    if (error) fail("exports:list", error);
    return data.map(toExport).filter((e): e is ExportRecord => e !== null);
  }

  async getExport(userId: string, planId: string, provider: CalendarProvider) {
    const { data, error } = await this.db
      .from("calendar_exports")
      .select("*")
      .eq("user_id", userId)
      .eq("plan_id", planId)
      .eq("provider", provider)
      .maybeSingle();
    if (error) fail("exports:get", error);
    return data ? toExport(data) : null;
  }

  async recordExport(userId: string, record: Omit<ExportRecord, "exportCount" | "lastExportedAt">) {
    const existing = await this.getExport(userId, record.planId, record.provider);
    const row = {
      user_id: userId,
      plan_id: record.planId,
      provider: record.provider,
      options: record.options as unknown as Json,
      fingerprint: record.fingerprint,
      plan_version: record.planVersion,
      event_count: record.eventCount,
      export_count: (existing?.exportCount ?? 0) + 1,
      last_exported_at: new Date().toISOString(),
    };
    const { data, error } = await this.db
      .from("calendar_exports")
      .upsert(row, { onConflict: "plan_id,provider" })
      .select("*")
      .single();
    if (error) fail("exports:record", error);
    const saved = toExport(data);
    if (!saved) throw new Error("[calendar:exports:record] invalid row");
    return saved;
  }

  async deleteExport(userId: string, planId: string, provider: CalendarProvider) {
    const { error } = await this.db.from("calendar_exports").delete().eq("user_id", userId).eq("plan_id", planId).eq("provider", provider);
    if (error) fail("exports:delete", error);
  }

  async getConnection(userId: string, provider: "google") {
    const { data, error } = await this.db
      .from("calendar_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", provider)
      .maybeSingle();
    if (error) fail("connection:get", error);
    return data ? toConnection(data) : null;
  }

  // ---- privileged ----------------------------------------------------------

  async saveConnection(userId: string, info: Pick<ConnectionInfo, "calendarId" | "calendarName" | "scope">, secrets: ConnectionSecrets) {
    const { data, error } = await this.admin
      .from("calendar_connections")
      .upsert(
        {
          user_id: userId,
          provider: "google",
          status: "connected",
          calendar_id: info.calendarId,
          calendar_name: info.calendarName,
          scope: info.scope,
          last_error: null,
          connected_at: new Date().toISOString(),
        },
        { onConflict: "user_id,provider" },
      )
      .select("*")
      .single();
    if (error) fail("connection:save", error);
    const { error: secretError } = await this.admin.from("calendar_connection_secrets").upsert({
      connection_id: data.id,
      user_id: userId,
      refresh_token: secrets.refreshToken,
      access_token: secrets.accessToken,
      access_token_expires_at: secrets.accessTokenExpiresAt,
    });
    if (secretError) fail("connection:secrets", secretError);
    return toConnection(data);
  }

  async getSecrets(userId: string, provider: "google") {
    const { data, error } = await this.admin
      .from("calendar_connections")
      .select("*, calendar_connection_secrets(*)")
      .eq("user_id", userId)
      .eq("provider", provider)
      .maybeSingle();
    if (error) fail("secrets:get", error);
    if (!data) return null;
    const raw = (data as unknown as { calendar_connection_secrets: Tables<"calendar_connection_secrets"> | Tables<"calendar_connection_secrets">[] | null })
      .calendar_connection_secrets;
    const secret = Array.isArray(raw) ? raw[0] : raw;
    if (!secret) return null;
    return {
      connection: toConnection(data),
      secrets: {
        refreshToken: secret.refresh_token,
        accessToken: secret.access_token,
        accessTokenExpiresAt: secret.access_token_expires_at,
      },
    };
  }

  async updateSecrets(userId: string, connectionId: string, secrets: Partial<ConnectionSecrets>) {
    const patch: Partial<Tables<"calendar_connection_secrets">> = {};
    if (secrets.refreshToken !== undefined) patch.refresh_token = secrets.refreshToken;
    if (secrets.accessToken !== undefined) patch.access_token = secrets.accessToken;
    if (secrets.accessTokenExpiresAt !== undefined) patch.access_token_expires_at = secrets.accessTokenExpiresAt;
    const { error } = await this.admin.from("calendar_connection_secrets").update(patch).eq("connection_id", connectionId).eq("user_id", userId);
    if (error) fail("secrets:update", error);
  }

  async updateConnection(
    userId: string,
    connectionId: string,
    patch: Partial<Pick<ConnectionInfo, "status" | "calendarId" | "calendarName" | "lastError">>,
  ) {
    const row: Partial<Tables<"calendar_connections">> = {};
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.calendarId !== undefined) row.calendar_id = patch.calendarId;
    if (patch.calendarName !== undefined) row.calendar_name = patch.calendarName;
    if (patch.lastError !== undefined) row.last_error = patch.lastError?.slice(0, 300) ?? null;
    const { error } = await this.admin.from("calendar_connections").update(row).eq("id", connectionId).eq("user_id", userId);
    if (error) fail("connection:update", error);
  }

  async deleteConnection(userId: string, provider: "google") {
    // Secrets and links cascade from the connection.
    const { error } = await this.admin.from("calendar_connections").delete().eq("user_id", userId).eq("provider", provider);
    if (error) fail("connection:delete", error);
    const { error: exportsError } = await this.admin.from("calendar_exports").delete().eq("user_id", userId).eq("provider", provider);
    if (exportsError) fail("connection:exports", exportsError);
  }

  async listLinks(userId: string, planId: string, provider: CalendarProvider): Promise<EventLinkRecord[]> {
    const { data, error } = await this.admin
      .from("calendar_event_links")
      .select("session_id, external_event_id, fingerprint, synced_at")
      .eq("user_id", userId)
      .eq("plan_id", planId)
      .eq("provider", provider);
    if (error) fail("links:list", error);
    return data.map((l) => ({ sessionId: l.session_id, externalId: l.external_event_id, fingerprint: l.fingerprint, syncedAt: l.synced_at }));
  }

  async upsertLinks(userId: string, planId: string, connectionId: string, provider: CalendarProvider, links: EventLinkRecord[]) {
    if (!links.length) return;
    const { error } = await this.admin.from("calendar_event_links").upsert(
      links.map((l) => ({
        user_id: userId,
        plan_id: planId,
        connection_id: connectionId,
        provider,
        session_id: l.sessionId,
        external_event_id: l.externalId,
        fingerprint: l.fingerprint,
        synced_at: l.syncedAt,
      })),
      { onConflict: "plan_id,provider,session_id" },
    );
    if (error) fail("links:upsert", error);
  }

  async deleteLinks(userId: string, planId: string, provider: CalendarProvider, sessionIds: string[]) {
    if (!sessionIds.length) return;
    const { error } = await this.admin
      .from("calendar_event_links")
      .delete()
      .eq("user_id", userId)
      .eq("plan_id", planId)
      .eq("provider", provider)
      .in("session_id", sessionIds);
    if (error) fail("links:delete", error);
  }
}

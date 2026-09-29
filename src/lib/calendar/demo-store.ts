import "server-only";

import { randomUUID } from "node:crypto";

import { loadDemo, mutateDemo, withoutUser } from "@/lib/demo/store";

import { DEFAULT_CALENDAR_PREFERENCES, type CalendarPreferences, type CalendarProvider } from "./model";
import type { CalendarStore, ConnectionInfo, ConnectionSecrets, EventLinkRecord, ExportRecord } from "./store";

const strip = withoutUser;

function info(c: ConnectionInfo): ConnectionInfo {
  const { id, provider, status, calendarId, calendarName, scope, lastError, connectedAt } = c;
  return { id, provider, status, calendarId, calendarName, scope, lastError, connectedAt };
}

/** Demo-mode calendar persistence against the local JSON file. */
export class DemoCalendarStore implements CalendarStore {
  async getPreferences(userId: string) {
    return (await loadDemo()).calendarPreferences[userId] ?? DEFAULT_CALENDAR_PREFERENCES;
  }

  async savePreferences(userId: string, prefs: CalendarPreferences) {
    await mutateDemo((s) => {
      s.calendarPreferences[userId] = prefs;
    });
  }

  async listExports(userId: string) {
    return (await loadDemo()).calendarExports.filter((e) => e.userId === userId).map(strip);
  }

  async getExport(userId: string, planId: string, provider: CalendarProvider) {
    const e = (await loadDemo()).calendarExports.find((x) => x.userId === userId && x.planId === planId && x.provider === provider);
    return e ? strip(e) : null;
  }

  recordExport(userId: string, record: Omit<ExportRecord, "exportCount" | "lastExportedAt">) {
    return mutateDemo((s) => {
      if (!s.plans[record.planId] || s.plans[record.planId].userId !== userId) throw new Error("plan not found");
      const existing = s.calendarExports.find((x) => x.userId === userId && x.planId === record.planId && x.provider === record.provider);
      const next = {
        ...record,
        userId,
        exportCount: (existing?.exportCount ?? 0) + 1,
        lastExportedAt: new Date().toISOString(),
      };
      s.calendarExports = [...s.calendarExports.filter((x) => x !== existing), next];
      return strip(next);
    });
  }

  async deleteExport(userId: string, planId: string, provider: CalendarProvider) {
    await mutateDemo((s) => {
      s.calendarExports = s.calendarExports.filter((x) => !(x.userId === userId && x.planId === planId && x.provider === provider));
    });
  }

  async getConnection(userId: string, provider: "google") {
    const c = (await loadDemo()).connections.find((x) => x.userId === userId && x.provider === provider);
    return c ? info(c) : null;
  }

  saveConnection(userId: string, data: Pick<ConnectionInfo, "calendarId" | "calendarName" | "scope">, secrets: ConnectionSecrets) {
    return mutateDemo((s) => {
      const existing = s.connections.find((x) => x.userId === userId && x.provider === "google");
      const next = {
        id: existing?.id ?? randomUUID(),
        userId,
        provider: "google" as const,
        status: "connected" as const,
        lastError: null,
        connectedAt: new Date().toISOString(),
        ...data,
        secrets,
      };
      s.connections = [...s.connections.filter((x) => x !== existing), next];
      return info(next);
    });
  }

  async getSecrets(userId: string, provider: "google") {
    const c = (await loadDemo()).connections.find((x) => x.userId === userId && x.provider === provider);
    return c ? { connection: info(c), secrets: c.secrets } : null;
  }

  async updateSecrets(userId: string, connectionId: string, secrets: Partial<ConnectionSecrets>) {
    await mutateDemo((s) => {
      const c = s.connections.find((x) => x.id === connectionId && x.userId === userId);
      if (c) c.secrets = { ...c.secrets, ...secrets };
    });
  }

  async updateConnection(userId: string, connectionId: string, patch: Partial<Pick<ConnectionInfo, "status" | "calendarId" | "calendarName" | "lastError">>) {
    await mutateDemo((s) => {
      const c = s.connections.find((x) => x.id === connectionId && x.userId === userId);
      if (c) Object.assign(c, patch);
    });
  }

  async deleteConnection(userId: string, provider: "google") {
    await mutateDemo((s) => {
      const ids = new Set(s.connections.filter((x) => x.userId === userId && x.provider === provider).map((x) => x.id));
      s.connections = s.connections.filter((x) => !ids.has(x.id));
      s.eventLinks = s.eventLinks.filter((l) => !ids.has(l.connectionId));
      s.calendarExports = s.calendarExports.filter((e) => !(e.userId === userId && e.provider === provider));
    });
  }

  async listLinks(userId: string, planId: string, provider: CalendarProvider): Promise<EventLinkRecord[]> {
    return (await loadDemo()).eventLinks
      .filter((l) => l.userId === userId && l.planId === planId && l.provider === provider)
      .map(({ sessionId, externalId, fingerprint, syncedAt }) => ({ sessionId, externalId, fingerprint, syncedAt }));
  }

  async upsertLinks(userId: string, planId: string, connectionId: string, provider: CalendarProvider, links: EventLinkRecord[]) {
    if (!links.length) return;
    await mutateDemo((s) => {
      const ids = new Set(links.map((l) => l.sessionId));
      s.eventLinks = [
        ...s.eventLinks.filter((l) => !(l.planId === planId && l.provider === provider && ids.has(l.sessionId))),
        ...links.map((l) => ({ ...l, userId, planId, connectionId, provider })),
      ];
    });
  }

  async deleteLinks(userId: string, planId: string, provider: CalendarProvider, sessionIds: string[]) {
    if (!sessionIds.length) return;
    const ids = new Set(sessionIds);
    await mutateDemo((s) => {
      s.eventLinks = s.eventLinks.filter((l) => !(l.userId === userId && l.planId === planId && l.provider === provider && ids.has(l.sessionId)));
    });
  }
}

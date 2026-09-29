import type { PlanDoc } from "@/lib/plan/schema";

import { buildEvents, exportFingerprint, type CalendarProvider } from "./model";
import type { ConnectionInfo, ExportRecord } from "./store";

/**
 * Is what's in someone's calendar still what their routine says?
 * Recomputes the events with the settings used at export time and compares
 * fingerprints — so an edit, added/removed session or timezone change is
 * noticed, while unrelated edits (notes, "why this fits") are not.
 */

export type ProviderState = "current" | "out_of_date" | "needs_reconnect";

export type ProviderStatus = {
  provider: CalendarProvider;
  state: ProviderState;
  record: ExportRecord;
};

export type PlanCalendarStatus = {
  ics: ProviderStatus | null;
  google: ProviderStatus | null;
};

export function isExportCurrent(doc: PlanDoc, planId: string, record: ExportRecord, siteUrl: string): boolean {
  const events = buildEvents(doc, { planId, options: record.options, siteUrl });
  return exportFingerprint(events) === record.fingerprint;
}

export function planCalendarStatus(p: {
  doc: PlanDoc;
  planId: string;
  exports: ExportRecord[];
  connection: ConnectionInfo | null;
  siteUrl: string;
}): PlanCalendarStatus {
  const status = (provider: CalendarProvider): ProviderStatus | null => {
    const record = p.exports.find((e) => e.planId === p.planId && e.provider === provider);
    if (!record) return null;
    if (provider === "google" && (!p.connection || p.connection.status === "needs_reconnect")) {
      return { provider, state: "needs_reconnect", record };
    }
    return { provider, state: isExportCurrent(p.doc, p.planId, record, p.siteUrl) ? "current" : "out_of_date", record };
  };
  return { ics: status("ics"), google: status("google") };
}

export type CalendarBadge = { label: string; tone: "none" | "ok" | "attention" };

export function calendarBadge(s: PlanCalendarStatus): CalendarBadge {
  if (s.google) {
    if (s.google.state === "needs_reconnect") return { label: "Reconnect Google Calendar", tone: "attention" };
    if (s.google.state === "out_of_date") return { label: "Calendar needs an update", tone: "attention" };
    return { label: "In Google Calendar", tone: "ok" };
  }
  if (s.ics) {
    if (s.ics.state === "out_of_date") return { label: "Changed since your calendar file", tone: "attention" };
    return { label: "Added with a calendar file", tone: "ok" };
  }
  return { label: "Not in a calendar", tone: "none" };
}

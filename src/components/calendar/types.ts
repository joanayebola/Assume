import type { CalendarPreferences, ExportOptions } from "@/lib/calendar/model";
import type { ProviderState } from "@/lib/calendar/status";

/** Serializable calendar context passed from the plan page to client components. */

export type ExportSummary = {
  options: ExportOptions;
  lastExportedAt: string;
  eventCount: number;
  exportCount: number;
  state: ProviderState;
};

export type CalendarContext = {
  planId: string;
  siteUrl: string;
  /** Today's date in the plan's timezone — the default start date. */
  planToday: string;
  viewerTimeZone: string;
  googleAvailable: boolean;
  google: { connected: boolean; needsReconnect: boolean; calendarName: string | null };
  preferences: CalendarPreferences;
  exports: { ics: ExportSummary | null; google: ExportSummary | null };
};

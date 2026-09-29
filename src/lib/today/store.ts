/**
 * Check-ins for single occurrences: Done, Skip, or Move (today only).
 * There is intentionally nothing here that counts, scores or streaks.
 */

export type CheckinStatus = "done" | "skipped";

export type Checkin = {
  planId: string;
  sessionId: string;
  /** Local date in the plan's timezone that the occurrence belongs to. */
  date: string;
  status: CheckinStatus | null;
  /** ISO instant when a moved occurrence now happens. */
  movedTo: string | null;
};

export interface CheckinStore {
  /** Check-ins whose occurrence date falls in [fromDate, toDate]. */
  list(userId: string, fromDate: string, toDate: string): Promise<Checkin[]>;
  /** Upsert; a check-in with neither status nor move is deleted. */
  save(userId: string, checkin: Checkin): Promise<void>;
}

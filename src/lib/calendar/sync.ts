import type { CalendarEvent } from "./model";
import type { EventLinkRecord } from "./store";

/**
 * Calendar sync as a pure diff: current events vs. what was last synced.
 * Sessions are matched by id, never by title/time, so editing a session
 * updates its event in place instead of creating a duplicate.
 */

export type SyncDiff = {
  create: CalendarEvent[];
  update: { event: CalendarEvent; link: EventLinkRecord }[];
  remove: EventLinkRecord[];
  unchanged: { event: CalendarEvent; link: EventLinkRecord }[];
};

export function diffSync(events: CalendarEvent[], links: EventLinkRecord[]): SyncDiff {
  const bySession = new Map(links.map((l) => [l.sessionId, l]));
  const wanted = new Set(events.map((e) => e.sessionId));
  const diff: SyncDiff = { create: [], update: [], remove: [], unchanged: [] };
  for (const event of events) {
    const link = bySession.get(event.sessionId);
    if (!link) diff.create.push(event);
    else if (link.fingerprint !== event.fingerprint) diff.update.push({ event, link });
    else diff.unchanged.push({ event, link });
  }
  diff.remove = links.filter((l) => !wanted.has(l.sessionId));
  return diff;
}

export const hasChanges = (d: SyncDiff) => d.create.length + d.update.length + d.remove.length > 0;

/** Minimal provider operations the executor needs (Google today; others later). */
export interface CalendarProviderClient {
  insert(event: CalendarEvent, id: string): Promise<string>;
  update(event: CalendarEvent, externalId: string): Promise<string>;
  remove(externalId: string): Promise<void>;
}

export type ProviderErrorKind = "not_found" | "conflict" | "other";

export type SyncResult = {
  links: EventLinkRecord[];
  removedSessionIds: string[];
  created: number;
  updated: number;
  removed: number;
  failed: { sessionId: string; error: unknown }[];
};

/**
 * Apply a diff. Self-healing where it's safe:
 *  • update on an event the person deleted in their calendar → recreate it
 *  • insert that already exists (a retried request) → update it instead
 *  • remove on an event that's already gone → fine
 * Links are only written for operations that succeeded, so a partial failure
 * can simply be retried without duplicating anything.
 */
export async function applySync(
  diff: SyncDiff,
  client: CalendarProviderClient,
  idFor: (sessionId: string) => string,
  classify: (error: unknown) => ProviderErrorKind,
  now = new Date().toISOString(),
): Promise<SyncResult> {
  const result: SyncResult = { links: [], removedSessionIds: [], created: 0, updated: 0, removed: 0, failed: [] };
  const linked = (event: CalendarEvent, externalId: string) =>
    result.links.push({ sessionId: event.sessionId, externalId, fingerprint: event.fingerprint, syncedAt: now });

  for (const event of diff.create) {
    const id = idFor(event.sessionId);
    try {
      linked(event, await client.insert(event, id));
      result.created++;
    } catch (error) {
      if (classify(error) !== "conflict") {
        result.failed.push({ sessionId: event.sessionId, error });
        continue;
      }
      try {
        linked(event, await client.update(event, id));
        result.created++;
      } catch (retryError) {
        result.failed.push({ sessionId: event.sessionId, error: retryError });
      }
    }
  }

  for (const { event, link } of diff.update) {
    try {
      linked(event, await client.update(event, link.externalId));
      result.updated++;
    } catch (error) {
      if (classify(error) !== "not_found") {
        result.failed.push({ sessionId: event.sessionId, error });
        continue;
      }
      try {
        linked(event, await client.insert(event, idFor(event.sessionId)));
        result.updated++;
      } catch (retryError) {
        if (classify(retryError) === "conflict") {
          // A deleted event keeps its id; updating it restores it.
          try {
            linked(event, await client.update(event, idFor(event.sessionId)));
            result.updated++;
            continue;
          } catch (e) {
            retryError = e;
          }
        }
        result.failed.push({ sessionId: event.sessionId, error: retryError });
      }
    }
  }

  for (const link of diff.remove) {
    try {
      await client.remove(link.externalId);
      result.removed++;
      result.removedSessionIds.push(link.sessionId);
    } catch (error) {
      if (classify(error) === "not_found") {
        result.removed++;
        result.removedSessionIds.push(link.sessionId);
      } else {
        result.failed.push({ sessionId: link.sessionId, error });
      }
    }
  }

  return result;
}

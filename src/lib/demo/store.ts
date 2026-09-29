import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CalendarPreferences, CalendarProvider } from "@/lib/calendar/model";
import type { Grant, Purchase } from "@/lib/billing/store";
import type { ConnectionInfo, ConnectionSecrets, ExportRecord } from "@/lib/calendar/store";
import type { AffirmationMode, GenerationStatus, IntakeDraft } from "@/lib/intake/model";
import type { IntakeSnapshotV2 } from "@/lib/intake/snapshot";
import type { PlanDoc } from "@/lib/plan/schema";
import type { GenerationKind, RequestParams, VersionSource } from "@/lib/plan/store";
import type { Enums } from "@/types/database";

/**
 * Demo-mode persistence: one JSON file in .demo-data/ (git-ignored; override
 * the folder with ASSUME_DEMO_DATA_DIR). Survives refreshes and dev-server
 * restarts. Never used when Supabase is configured — see isDemoMode().
 */

export type DemoRequest = {
  id: string;
  userId: string;
  intakeId: string;
  manifestationId: string;
  planId: string | null;
  kind: GenerationKind;
  params: RequestParams;
  status: GenerationStatus;
  attempts: number;
  baseVersion: number | null;
  snapshot: IntakeSnapshotV2;
  title: string;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type DemoPlan = {
  id: string;
  userId: string;
  intakeId: string;
  manifestationId: string;
  title: string;
  status: Enums<"plan_status">;
  structure: Enums<"routine_style">;
  dailyMinutes: number | null;
  doc: PlanDoc;
  version: number;
  intake: IntakeSnapshotV2;
  generationModel: string | null;
  updatedAt: string;
  createdAt?: string;
  pausedAt?: string | null;
  completedAt?: string | null;
  archivedAt?: string | null;
};

export type DemoVersion = {
  planId: string;
  userId: string;
  version: number;
  doc: PlanDoc;
  source: VersionSource;
  summary: string | null;
  model: string | null;
  requestId: string | null;
  createdAt: string;
};

export type DemoCheckin = {
  userId: string;
  planId: string;
  sessionId: string;
  date: string;
  status: "done" | "skipped" | null;
  movedTo: string | null;
};

export type DemoManifested = {
  id: string;
  userId: string;
  planId: string | null;
  title: string;
  desire: string;
  note: string | null;
  manifestedOn: string;
  createdAt: string;
};

export type DemoConnection = ConnectionInfo & { userId: string; secrets: ConnectionSecrets };

export type DemoEventLink = {
  userId: string;
  planId: string;
  connectionId: string;
  provider: CalendarProvider;
  sessionId: string;
  externalId: string;
  fingerprint: string;
  syncedAt: string;
};

export type DemoStore = {
  intakes: Record<string, IntakeDraft & { userId: string }>;
  requests: Record<string, DemoRequest>;
  plans: Record<string, DemoPlan>;
  versions: DemoVersion[];
  calendarPreferences: Record<string, CalendarPreferences>;
  calendarExports: (ExportRecord & { userId: string })[];
  connections: DemoConnection[];
  eventLinks: DemoEventLink[];
  checkins: DemoCheckin[];
  manifested: DemoManifested[];
  purchases: (Purchase & { providerPaymentId: string | null })[];
  grants: (Grant & { userId: string; purchaseId: string | null; providerSubscriptionId: string | null })[];
  webhookEvents: Record<string, { type: string; processedAt: string | null }>;
  intakeDefaults: Record<string, unknown>;
};

const empty = (): DemoStore => ({
  intakes: {},
  requests: {},
  plans: {},
  versions: [],
  calendarPreferences: {},
  calendarExports: [],
  connections: [],
  eventLinks: [],
  checkins: [],
  manifested: [],
  purchases: [],
  grants: [],
  webhookEvents: {},
  intakeDefaults: {},
});

const FILE = () => path.join(process.env.ASSUME_DEMO_DATA_DIR || path.join(process.cwd(), ".demo-data"), "intakes.json");

let queue: Promise<unknown> = Promise.resolve();

function upgrade(raw: Partial<DemoStore> & { requests?: Record<string, Partial<DemoRequest>> }): DemoStore {
  // Requests written before Phase 3 lack the newer fields.
  const requests: Record<string, DemoRequest> = {};
  for (const [id, r] of Object.entries(raw.requests ?? {})) {
    const legacy = r as Partial<DemoRequest> & { snapshot: IntakeSnapshotV2 };
    requests[id] = {
      manifestationId: legacy.intakeId ?? id,
      kind: "initial",
      params: {},
      attempts: 0,
      baseVersion: null,
      errorCode: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      ...legacy,
    } as DemoRequest;
  }
  return { ...empty(), ...raw, requests };
}

export async function loadDemo(): Promise<DemoStore> {
  try {
    return upgrade(JSON.parse(await readFile(FILE(), "utf8")));
  } catch {
    return empty();
  }
}

async function persist(store: DemoStore) {
  const file = FILE();
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2));
  await rename(tmp, file);
}

/** Serialise read-modify-write cycles so concurrent writes can't clobber each other. */
export function mutateDemo<T>(fn: (store: DemoStore) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const store = await loadDemo();
    const result = await fn(store);
    await persist(store);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

/** Drop the owner column before returning a demo row to callers. */
export function withoutUser<T extends { userId: string }>(row: T): Omit<T, "userId"> {
  const rest: Partial<T> = { ...row };
  delete rest.userId;
  return rest as Omit<T, "userId">;
}

export type { AffirmationMode };

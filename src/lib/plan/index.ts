import "server-only";

import { GenerationError } from "@/lib/ai/generator";
import { isDemoMode } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { DemoPlanStore } from "./demo-store";
import type { PlanStore, WorkerStore } from "./store";
import { SupabasePlanStore, SupabaseWorkerStore } from "./supabase-store";

/** User-scoped store for the current request. */
export async function getPlanStore(): Promise<PlanStore> {
  if (isDemoMode()) return new DemoPlanStore();
  return new SupabasePlanStore(await createClient());
}

/** Privileged store for the generation runner. Requires SUPABASE_SECRET_KEY in production. */
export function getWorkerStore(): WorkerStore {
  if (isDemoMode()) return new DemoPlanStore();
  const admin = createAdminClient();
  if (!admin) {
    throw new GenerationError("not_configured", "SUPABASE_SECRET_KEY is not set, so results can't be saved", true);
  }
  return new SupabaseWorkerStore(admin);
}

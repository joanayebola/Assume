import "server-only";

import { isDemoMode } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import { DemoIntakeRepository } from "./demo-repository";
import type { IntakeRepository } from "./repository";
import { SupabaseIntakeRepository } from "./supabase-repository";

/** Per-request repository. Demo storage only when demo mode is active. */
export async function getIntakeRepository(): Promise<IntakeRepository> {
  if (isDemoMode()) return new DemoIntakeRepository();
  return new SupabaseIntakeRepository(await createClient());
}

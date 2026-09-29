import "server-only";

import { isDemoMode } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { DemoBillingStore } from "./demo-store";
import type { BillingStore } from "./store";
import { SupabaseBillingStore } from "./supabase-store";

/** For signed-in requests: user-scoped reads + privileged writes. */
export async function getBillingStore(): Promise<BillingStore> {
  if (isDemoMode()) return new DemoBillingStore();
  return new SupabaseBillingStore(await createClient(), createAdminClient());
}

/** For webhooks and the generation worker: no user session. */
export function getPrivilegedBillingStore(): BillingStore {
  if (isDemoMode()) return new DemoBillingStore();
  return new SupabaseBillingStore(null, createAdminClient());
}

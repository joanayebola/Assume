import "server-only";

import { getGoogleCalendarEnv, getSupabaseSecretKey, isDemoMode } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { DemoCalendarStore } from "./demo-store";
import type { CalendarStore } from "./store";
import { SupabaseCalendarStore } from "./supabase-store";

export async function getCalendarStore(): Promise<CalendarStore> {
  if (isDemoMode()) return new DemoCalendarStore();
  return new SupabaseCalendarStore(await createClient(), createAdminClient());
}

/**
 * Google sync needs OAuth credentials, a token key and (outside demo mode)
 * the service-role key that guards token storage.
 */
export function isGoogleCalendarAvailable(): boolean {
  try {
    if (!getGoogleCalendarEnv()) return false;
  } catch {
    return false;
  }
  return isDemoMode() || Boolean(getSupabaseSecretKey());
}

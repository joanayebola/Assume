import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnv, getSupabaseSecretKey } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Privileged Supabase client (bypasses RLS). Only the generation worker uses
 * it, and only through the narrow worker SQL functions. Never import this
 * from client code or expose its results unfiltered.
 */
export function createAdminClient() {
  const secret = getSupabaseSecretKey();
  if (!secret) return null;
  const { url } = getSupabaseEnv();
  return createClient<Database>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

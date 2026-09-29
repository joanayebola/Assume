import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { demoProfile, demoUser } from "@/lib/demo/demo-user";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import { routes } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

/** The verified user for this request, or null. Deduplicated per render. */
export const getCurrentUser = cache(async () => {
  // Auth state is per-request: never let a page that reads it be prerendered,
  // even in environments where Supabase isn't configured yet.
  await connection();
  if (isDemoMode()) return demoUser;
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

/** Use at the top of any signed-in page or layout. */
export const requireUser = cache(async () => {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  return user;
});

/**
 * The signed-in user's profile. Falls back to auth metadata if the profile
 * row is missing (e.g. migrations not yet applied), so the shell still renders.
 */
export const getViewer = cache(async () => {
  const user = await requireUser();

  if (isDemoMode()) {
    const profile = demoProfile();
    return { user, profile, hasProfileRow: true, displayName: profile.display_name ?? "there", isDemo: true };
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const metaName =
    typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name : null;

  const viewer: Profile = profile ?? {
    id: user.id,
    email: user.email ?? null,
    display_name: metaName,
    timezone: "UTC",
    onboarding_completed_at: null,
    calendar_preferences: null,
    intake_defaults: null,
    created_at: user.created_at,
    updated_at: user.created_at,
  };

  return {
    user,
    profile: viewer,
    hasProfileRow: Boolean(profile),
    displayName: viewer.display_name ?? user.email?.split("@")[0] ?? "there",
    isDemo: false,
  };
});

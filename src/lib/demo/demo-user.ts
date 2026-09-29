import "server-only";

import type { User } from "@supabase/supabase-js";

import type { Profile } from "@/types/database";

/** Stable identity used for every request while demo mode is on. */
export const DEMO_USER_ID = "00000000-0000-4000-8000-00000000d3e0";

const createdAt = "2026-01-01T00:00:00.000Z";

export const demoUser: User = {
  id: DEMO_USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "demo@assume.local",
  app_metadata: {},
  user_metadata: { display_name: "Demo" },
  created_at: createdAt,
};

export function demoProfile(): Profile {
  return {
    id: DEMO_USER_ID,
    email: demoUser.email ?? null,
    display_name: "Demo",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    onboarding_completed_at: null,
    calendar_preferences: null,
    intake_defaults: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

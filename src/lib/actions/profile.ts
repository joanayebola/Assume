"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth/session";
import { isValidTimeZone } from "@/lib/calendar/zoned";
import { saveIntakeDefaults } from "@/lib/data/intake-defaults";
import { isDemoMode } from "@/lib/env";
import { intakeDefaultsSchema } from "@/lib/intake/defaults";
import { routes } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { profileSchema, type ProfileInput } from "@/lib/validation/profile";

import { fieldErrorsFrom, type ActionResult } from "./types";
import { logError } from "@/lib/log";

export async function updateProfile(input: ProfileInput): Promise<ActionResult<keyof ProfileInput>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Your session has expired. Log in again to save changes." };

  if (isDemoMode()) return { ok: false, message: "Profile changes aren't saved in demo mode." };

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName, timezone: parsed.data.timezone })
    .eq("id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    logError("updateProfile", error);
    return { ok: false, message: "We couldn't save your profile. Please try again." };
  }
  if (!data) {
    return {
      ok: false,
      message: "We couldn't find your profile. Make sure the database migrations have been applied.",
    };
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "Profile saved." };
}

/** Just the timezone — used by the "you seem to be in…" prompt on Today. */
export async function updateTimezone(timezone: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Your session has expired. Log in again." };
  if (!isValidTimeZone(timezone)) return { ok: false, message: "That timezone isn't recognised." };
  if (isDemoMode()) return { ok: false, message: "Timezone changes aren't saved in demo mode." };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ timezone }).eq("id", user.id);
  if (error) {
    logError("updateTimezone", error);
    return { ok: false, message: "We couldn't save your timezone. Please try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateIntakeDefaults(raw: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Your session has expired. Log in again." };
  const parsed = intakeDefaultsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check your choices." };
  try {
    await saveIntakeDefaults(user.id, parsed.data);
    revalidatePath(routes.settings);
    return { ok: true, message: "Saved. New plans will start with these." };
  } catch (error) {
    logError("updateIntakeDefaults", error);
    return { ok: false, message: "We couldn't save your preferences. Please try again." };
  }
}

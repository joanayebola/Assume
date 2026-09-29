"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { friendlyAuthError, SUPABASE_NOT_CONFIGURED } from "@/lib/auth/errors";
import { isValidTimeZone } from "@/lib/calendar/zoned";
import { getSiteUrl, isSupabaseConfigured } from "@/lib/env";
import { routes } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/utils";
import {
  forgotPasswordSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
  type ForgotPasswordInput,
  type SignInInput,
  type SignUpInput,
  type UpdatePasswordInput,
} from "@/lib/validation/auth";

import { fieldErrorsFrom, type ActionResult } from "./types";
import { track } from "@/lib/analytics/server";

/** Prefer the request origin so preview deployments send correct email links. */
async function origin() {
  const h = await headers();
  const fromHeader = h.get("origin");
  return fromHeader && /^https?:\/\//.test(fromHeader) ? fromHeader : getSiteUrl();
}

function callbackUrl(base: string, next: string) {
  return `${base}${routes.authCallback}?next=${encodeURIComponent(next)}`;
}

export async function signIn(input: SignInInput): Promise<ActionResult<keyof SignInInput>> {
  if (!isSupabaseConfigured()) return { ok: false, message: SUPABASE_NOT_CONFIGURED };

  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) return { ok: false, message: friendlyAuthError(error) };

  redirect(safeRedirectPath(parsed.data.next, routes.appHome));
}

export async function signUp(input: SignUpInput, deviceTimeZone?: string): Promise<ActionResult<keyof SignUpInput>> {
  if (!isSupabaseConfigured()) return { ok: false, message: SUPABASE_NOT_CONFIGURED };

  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // The browser's timezone becomes the profile default (the DB trigger re-validates it).
      data: {
        display_name: parsed.data.displayName,
        ...(deviceTimeZone && isValidTimeZone(deviceTimeZone) ? { timezone: deviceTimeZone } : {}),
      },
      emailRedirectTo: callbackUrl(await origin(), routes.appHome),
    },
  });

  if (error) return { ok: false, message: friendlyAuthError(error) };
  if (data.user) track("signup_completed", data.user.id);

  // Email confirmation disabled in Supabase → a session exists immediately.
  if (data.session) redirect(routes.appHome);

  return {
    ok: true,
    message: `We've sent a confirmation link to ${parsed.data.email}. Open it on this device to finish creating your account.`,
  };
}

export async function requestPasswordReset(
  input: ForgotPasswordInput,
): Promise<ActionResult<keyof ForgotPasswordInput>> {
  if (!isSupabaseConfigured()) return { ok: false, message: SUPABASE_NOT_CONFIGURED };

  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: callbackUrl(await origin(), routes.resetPassword),
  });

  // Rate limits are worth surfacing; anything else stays generic so we
  // never reveal whether an account exists.
  if (error?.code?.startsWith("over_")) return { ok: false, message: friendlyAuthError(error) };

  return {
    ok: true,
    message: `If an account exists for ${parsed.data.email}, a reset link is on its way.`,
  };
}

export async function updatePassword(
  input: UpdatePasswordInput,
): Promise<ActionResult<keyof UpdatePasswordInput>> {
  if (!isSupabaseConfigured()) return { ok: false, message: SUPABASE_NOT_CONFIGURED };

  const parsed = updatePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) return { ok: false, message: friendlyAuthError(error) };

  return { ok: true, message: "Password updated." };
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect(routes.home);
}

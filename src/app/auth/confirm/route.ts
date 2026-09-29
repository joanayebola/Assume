import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured } from "@/lib/env";
import { routes } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/utils";

const otpTypes = new Set<EmailOtpType>(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

/**
 * Token-hash verification for custom Supabase email templates, e.g.
 * {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
 *
 * Unlike the PKCE callback, this works even when the link is opened
 * on a different device/browser from the one that requested it.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const fallback = type === "recovery" ? routes.resetPassword : routes.appHome;
  const next = safeRedirectPath(searchParams.get("next"), fallback);

  const fail = (reason: string) => {
    const url = new URL(routes.login, origin);
    url.searchParams.set("error", reason);
    return NextResponse.redirect(url);
  };

  if (!isSupabaseConfigured()) return fail("not_configured");
  if (!tokenHash || !type || !otpTypes.has(type)) return fail("link_invalid");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return fail(error.code === "otp_expired" ? "link_expired" : "link_invalid");

  return NextResponse.redirect(new URL(next, origin));
}

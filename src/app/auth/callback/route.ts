import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured } from "@/lib/env";
import { routes } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/utils";

/**
 * PKCE callback for email confirmation, password recovery and (later) OAuth.
 * Supabase redirects here with ?code=… which we exchange for a session.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"), routes.appHome);

  const fail = (reason: string) => {
    const url = new URL(routes.login, origin);
    url.searchParams.set("error", reason);
    return NextResponse.redirect(url);
  };

  if (!isSupabaseConfigured()) return fail("not_configured");

  const providerError = searchParams.get("error_code") ?? searchParams.get("error");
  if (providerError) return fail(providerError === "otp_expired" ? "link_expired" : "link_invalid");
  if (!code) return fail("link_invalid");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(error.code === "otp_expired" ? "link_expired" : "link_invalid");

  return NextResponse.redirect(new URL(next, origin));
}

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/env";
import { guestOnlyPaths, protectedPrefixes, routes } from "@/lib/site";
import type { Database } from "@/types/database";

function matchesPrefix(pathname: string, prefixes: readonly string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the Supabase session cookie on every request and applies
 * coarse route protection. Pages still verify the user server-side —
 * this is a fast first gate, not the only one.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Let the marketing site work before Supabase is configured.
  if (!isSupabaseConfigured()) return response;

  // When a redirect URL isn't on Supabase's allow-list, confirmation and
  // recovery links fall back to the Site URL root with ?code= (or an error).
  // Route those to the real callback instead of silently ignoring them.
  // Only "/" is handled: other routes (e.g. calendar OAuth) use ?code= too.
  if (request.nextUrl.pathname === "/") {
    const code = request.nextUrl.searchParams.get("code");
    const errorCode = request.nextUrl.searchParams.get("error_code");
    if (code || errorCode) {
      const target = request.nextUrl.clone();
      target.search = "";
      if (code) {
        target.pathname = routes.authCallback;
        target.searchParams.set("code", code);
        target.searchParams.set("next", routes.appHome);
      } else {
        target.pathname = routes.login;
        target.searchParams.set("error", errorCode === "otp_expired" ? "link_expired" : "link_invalid");
      }
      return NextResponse.redirect(target);
    }
  }

  const { url, publishableKey } = getSupabaseEnv();

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Do not run code between createServerClient and getClaims():
  // it refreshes the session and must happen first.
  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims?.sub);

  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string, params?: Record<string, string>) => {
    const target = request.nextUrl.clone();
    target.pathname = path;
    target.search = "";
    if (params) Object.entries(params).forEach(([k, v]) => target.searchParams.set(k, v));
    const redirect = NextResponse.redirect(target);
    // Carry refreshed auth cookies across the redirect.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!isSignedIn && matchesPrefix(pathname, protectedPrefixes)) {
    return redirectTo(routes.login, { next: `${pathname}${search}` });
  }

  if (isSignedIn && matchesPrefix(pathname, guestOnlyPaths)) {
    return redirectTo(routes.appHome);
  }

  return response;
}

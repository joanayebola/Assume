import { NextResponse, type NextRequest } from "next/server";

import { getViewer } from "@/lib/auth/session";
import { getCalendarStore } from "@/lib/calendar";
import { GoogleScopeError, connectGoogle } from "@/lib/calendar/service";
import { OAUTH_COOKIE, OAUTH_COOKIE_PATH, openState, withCalendarFlag } from "@/lib/calendar/oauth-state";
import { safeTimeZone } from "@/lib/calendar/zoned";
import { getGoogleCalendarEnv, getSiteUrl } from "@/lib/env";
import { routes } from "@/lib/site";
import { logError } from "@/lib/log";
import { track } from "@/lib/analytics/server";

/**
 * GET ← Google redirects here after consent. Verifies state + the signed-in
 * user, exchanges the code (PKCE), checks the calendar permission was really
 * granted, then creates (or reuses) the "Assume" calendar.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const env = getGoogleCalendarEnv();
  const sealed = request.cookies.get(OAUTH_COOKIE)?.value;
  const saved = env ? openState(sealed, env.tokenKey) : null;
  const next = saved?.next ?? routes.settings;

  const finish = (flag: string) => {
    const res = NextResponse.redirect(new URL(withCalendarFlag(next, flag), request.url));
    res.cookies.set(OAUTH_COOKIE, "", { path: OAUTH_COOKIE_PATH, maxAge: 0 });
    res.headers.set("Cache-Control", "no-store");
    return res;
  };

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return finish(params.get("error") === "access_denied" ? "denied" : "error");
  if (!env || !saved || !params.get("code") || params.get("state") !== saved.state) return finish("expired");

  const viewer = await getViewer();
  if (viewer.user.id !== saved.userId) return finish("expired");

  try {
    await connectGoogle(await getCalendarStore(), viewer.user.id, {
      code: params.get("code")!,
      verifier: saved.verifier,
      redirectUri: `${getSiteUrl()}${OAUTH_COOKIE_PATH}/callback`,
      timeZone: safeTimeZone(viewer.profile.timezone),
    });
    track("calendar_connected", viewer.user.id, { provider: "google" });
    return finish("connected");
  } catch (error) {
    if (error instanceof GoogleScopeError) return finish("scope");
    logError("calendar:google:callback", error);
    return finish("error");
  }
}

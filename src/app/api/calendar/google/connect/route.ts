import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { isGoogleCalendarAvailable } from "@/lib/calendar";
import { authorizationUrl, pkcePair } from "@/lib/calendar/google";
import { newState, OAUTH_COOKIE, OAUTH_COOKIE_PATH, OAUTH_TTL_SECONDS, sealState, withCalendarFlag } from "@/lib/calendar/oauth-state";
import { getGoogleCalendarEnv, getSiteUrl } from "@/lib/env";
import { routes } from "@/lib/site";
import { safeRedirectPath } from "@/lib/utils";

/** GET → start the Google Calendar OAuth flow (the person explicitly tapped "Connect"). */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const next = safeRedirectPath(request.nextUrl.searchParams.get("next"), routes.settings);
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`${routes.login}?next=${encodeURIComponent(next)}`, request.url));

  const env = getGoogleCalendarEnv();
  if (!env || !isGoogleCalendarAvailable()) {
    return NextResponse.redirect(new URL(withCalendarFlag(next, "unavailable"), request.url));
  }

  const { verifier, challenge } = pkcePair();
  const state = newState();
  const response = NextResponse.redirect(
    authorizationUrl({
      clientId: env.clientId,
      redirectUri: `${getSiteUrl()}${OAUTH_COOKIE_PATH}/callback`,
      state,
      codeChallenge: challenge,
    }),
  );
  response.cookies.set(OAUTH_COOKIE, sealState({ state, verifier, userId: user.id, next, exp: Date.now() + OAUTH_TTL_SECONDS * 1000 }, env.tokenKey), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: OAUTH_COOKIE_PATH,
    maxAge: OAUTH_TTL_SECONDS,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

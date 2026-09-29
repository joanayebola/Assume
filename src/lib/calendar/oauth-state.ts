import "server-only";

import { randomBytes } from "node:crypto";

import { decryptToken, encryptToken } from "./crypto";

/**
 * Short-lived OAuth handshake state, kept in an encrypted, httpOnly cookie:
 * CSRF `state`, the PKCE verifier, who started it and where to return.
 */

export const OAUTH_COOKIE = "assume_gcal_oauth";
export const OAUTH_COOKIE_PATH = "/api/calendar/google";
export const OAUTH_TTL_SECONDS = 600;

export type OAuthState = { state: string; verifier: string; userId: string; next: string; exp: number };

export function newState() {
  return randomBytes(24).toString("base64url");
}

export function sealState(s: OAuthState, key: string) {
  return encryptToken(JSON.stringify(s), key);
}

export function openState(sealed: string | undefined, key: string): OAuthState | null {
  if (!sealed) return null;
  try {
    const s = JSON.parse(decryptToken(sealed, key)) as OAuthState;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

/** Adds ?calendar=<flag> to a same-origin path, keeping its other params. */
export function withCalendarFlag(path: string, flag: string) {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("calendar", flag);
  return `${base}?${params}`;
}

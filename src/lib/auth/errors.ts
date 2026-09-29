import type { AuthError } from "@supabase/supabase-js";

const messages: Record<string, string> = {
  invalid_credentials: "That email and password combination didn't work.",
  email_not_confirmed: "Confirm your email first — check your inbox for the link we sent.",
  user_already_exists: "An account with that email already exists. Try logging in.",
  email_exists: "An account with that email already exists. Try logging in.",
  weak_password: "Choose a stronger password — mix words, numbers or symbols.",
  same_password: "Your new password needs to be different from your current one.",
  over_email_send_rate_limit: "We've sent a few emails already. Give it a minute and try again.",
  over_request_rate_limit: "Too many attempts. Wait a moment and try again.",
  email_address_invalid: "That email address can't be used. Try another.",
  signup_disabled: "New sign-ups are paused right now.",
  session_not_found: "Your session has expired. Request a new link and try again.",
  otp_expired: "That link has expired. Request a new one.",
};

export function friendlyAuthError(error: Pick<AuthError, "code" | "message"> | null | undefined) {
  if (!error) return "Something went wrong. Please try again.";
  if (error.code && messages[error.code]) return messages[error.code];
  return "Something went wrong. Please try again.";
}

export const SUPABASE_NOT_CONFIGURED =
  "Accounts aren't available yet — Supabase hasn't been configured for this environment.";

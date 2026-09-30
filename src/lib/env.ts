import { z } from "zod";

/**
 * Typed environment access.
 *
 * NEXT_PUBLIC_* values must be referenced statically (process.env.NEXT_PUBLIC_X)
 * so Next.js can inline them into client bundles — never via process.env[key].
 *
 * Supabase values are validated lazily rather than at import time so the
 * marketing site can build and render before a Supabase project exists.
 * Anything that actually needs Supabase calls `getSupabaseEnv()`, which throws
 * a descriptive error if configuration is missing or malformed.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ error: "NEXT_PUBLIC_SUPABASE_URL must be a valid URL" }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string({ error: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required" })
    .min(1, { error: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required" }),
});

export type SupabaseEnv = {
  url: string;
  publishableKey: string;
};

function readPublicEnv() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    // Supabase's newer "publishable" key; the legacy anon key works identically.
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

export function isSupabaseConfigured(): boolean {
  return publicSchema.safeParse(readPublicEnv()).success;
}

export function getSupabaseEnv(): SupabaseEnv {
  const parsed = publicSchema.safeParse(readPublicEnv());
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.message}`).join("\n");
    throw new Error(
      `Supabase is not configured.\n${issues}\nCopy .env.example to .env.local and fill in your project values.`,
    );
  }
  return {
    url: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

/**
 * Demo mode lets the signed-in app (including the plan intake) be explored
 * without a Supabase project. It can never be active when Supabase is
 * configured, and outside `next dev` it must be switched on explicitly with
 * ASSUME_DEMO_MODE=true (server-only).
 */
export function isDemoMode(): boolean {
  if (isSupabaseConfigured()) return false;
  return process.env.NODE_ENV === "development" || process.env.ASSUME_DEMO_MODE === "true";
}

/**
 * Gemini configuration (server-only — never prefix these with NEXT_PUBLIC_).
 * Returns null when no API key is set.
 */
const geminiSchema = z.object({
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.8-flash"),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(300_000).default(90_000),
});

export function getGeminiEnv(): { apiKey: string; model: string; timeoutMs: number } | null {
  if (!process.env.GEMINI_API_KEY) return null;
  const parsed = geminiSchema.safeParse({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL || undefined,
    GEMINI_TIMEOUT_MS: process.env.GEMINI_TIMEOUT_MS || undefined,
  });
  if (!parsed.success) {
    throw new Error(`Invalid Gemini configuration: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  return { apiKey: parsed.data.GEMINI_API_KEY, model: parsed.data.GEMINI_MODEL, timeoutMs: parsed.data.GEMINI_TIMEOUT_MS };
}

/**
 * Google Calendar (server-only). All three are needed; otherwise Google sync
 * is hidden and .ics export is offered on its own.
 *  • GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET — a "Web application" OAuth client.
 *  • CALENDAR_TOKEN_KEY — secret used to encrypt OAuth tokens at rest
 *    (≥ 32 characters, e.g. `openssl rand -base64 32`).
 */
export function getGoogleCalendarEnv(): { clientId: string; clientSecret: string; tokenKey: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const tokenKey = process.env.CALENDAR_TOKEN_KEY;
  if (!clientId || !clientSecret || !tokenKey) return null;
  if (tokenKey.length < 32) throw new Error("CALENDAR_TOKEN_KEY must be at least 32 characters.");
  return { clientId, clientSecret, tokenKey };
}

/**
 * Server-only Supabase secret key (sb_secret_…, or the legacy service_role
 * key). Used exclusively by the generation worker to record results —
 * users can read their generation requests but never change their status.
 */
export function getSupabaseSecretKey(): string | null {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

/**
 * Canonical site origin, used for auth email redirects and metadata.
 * Falls back to Vercel's deployment URL, then localhost.
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  // On Vercel production, use the stable production domain — VERCEL_URL is
  // unique per deployment and would break OAuth / payment return URLs.
  const production =
    (process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV) === "production"
      ? (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL)
      : undefined;
  const vercel = production ?? process.env.NEXT_PUBLIC_VERCEL_URL ?? process.env.VERCEL_URL;
  const raw = explicit || (vercel ? `https://${vercel}` : "http://localhost:3000");
  const parsed = z.url().safeParse(raw);
  return (parsed.success ? parsed.data : "http://localhost:3000").replace(/\/$/, "");
}

/** Used when NEXT_PUBLIC_SUPPORT_EMAIL isn't set. */
export const DEFAULT_SUPPORT_EMAIL = "info.assume.day@gmail.com";

/** Public support address (shown on Contact, error screens and password help). */
export function getSupportEmail(): string {
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : DEFAULT_SUPPORT_EMAIL;
}

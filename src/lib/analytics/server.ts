import "server-only";

import { createHmac } from "node:crypto";

import { after } from "next/server";

import { logError } from "@/lib/log";

import { validateProps, type EventName, type EventProps } from "./events";

/**
 * Privacy-conscious product analytics, sent from the server.
 *
 *  • ANALYTICS_PROVIDER = none (default) | console | posthog | plausible
 *  • People are identified by an HMAC of their user id (ANALYTICS_SALT), never
 *    by email or the raw id; anonymous events use a per-visit random id.
 *  • Properties are schema-checked (see events.ts): no free text, ever.
 *  • No cookies, no client SDK, no session replay. Failures never affect the
 *    request that triggered them.
 */

type Provider = "none" | "console" | "posthog" | "plausible";

function provider(): Provider {
  const p = process.env.ANALYTICS_PROVIDER;
  return p === "console" || p === "posthog" || p === "plausible" ? p : "none";
}

export function analyticsEnabled() {
  return provider() !== "none";
}

export function distinctIdFor(userId: string) {
  const salt = process.env.ANALYTICS_SALT || process.env.CALENDAR_TOKEN_KEY || "assume";
  return createHmac("sha256", salt).update(userId).digest("hex").slice(0, 32);
}

async function send(event: EventName, distinctId: string, props: Record<string, string | number | boolean>) {
  switch (provider()) {
    case "console":
      console.info(`[analytics] ${event}`, JSON.stringify(props));
      return;
    case "posthog": {
      const key = process.env.POSTHOG_API_KEY;
      if (!key) return;
      const host = (process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
      await fetch(`${host}/i/v0/e/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Anonymous events: no person profiles, no IP-based geo.
        body: JSON.stringify({ api_key: key, event, distinct_id: distinctId, properties: { ...props, $process_person_profile: false, $ip: null } }),
        signal: AbortSignal.timeout(4000),
      });
      return;
    }
    case "plausible": {
      const domain = process.env.PLAUSIBLE_DOMAIN;
      if (!domain) return;
      const host = (process.env.PLAUSIBLE_HOST || "https://plausible.io").replace(/\/$/, "");
      await fetch(`${host}/api/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Assume-Server/1.0" },
        body: JSON.stringify({ name: event, domain, url: `https://${domain}/app`, props }),
        signal: AbortSignal.timeout(4000),
      });
      return;
    }
    default:
      return;
  }
}

/**
 * Record an event. `who` is a user id (hashed before sending) or an
 * anonymous visit id. Never throws; runs after the response when possible.
 */
export function track<E extends EventName>(event: E, who: string | null, props?: EventProps<E>, opts: { anonymous?: boolean } = {}) {
  if (!analyticsEnabled()) return;
  const clean = validateProps(event, props);
  if (!clean) return;
  const distinctId = who ? (opts.anonymous ? who.slice(0, 64) : distinctIdFor(who)) : "anonymous";
  const job = () => send(event, distinctId, clean).catch((error) => logError("analytics", error, { event }));
  try {
    after(job);
  } catch {
    // Outside a request scope (e.g. inside another after()): send directly.
    void job();
  }
}

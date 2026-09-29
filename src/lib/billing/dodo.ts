import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { dodoEnv } from "./config";

/**
 * Dodo Payments over its REST API (the same endpoints the official SDK
 * wraps): checkout sessions, payment lookup for server-side verification,
 * and Standard Webhooks signature verification.
 */

export class DodoError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DodoError";
  }
}

function env() {
  const e = dodoEnv();
  if (!e) throw new DodoError(0, "Dodo Payments is not configured");
  return e;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const { apiKey, baseUrl } = env();
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) {
    // Never echo Dodo's response body into logs: it can contain customer details.
    throw new DodoError(res.status, `Dodo Payments ${method} ${path.split("/")[1]} failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export type CheckoutSession = { session_id: string; checkout_url: string | null };

export function createCheckoutSession(p: {
  productId: string;
  email: string | null;
  name: string | null;
  returnUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}) {
  return call<CheckoutSession>("POST", "/checkouts", {
    product_cart: [{ product_id: p.productId, quantity: 1 }],
    ...(p.email ? { customer: { email: p.email, ...(p.name ? { name: p.name } : {}) } } : {}),
    return_url: p.returnUrl,
    cancel_url: p.cancelUrl,
    metadata: p.metadata,
  });
}

export type DodoPayment = {
  payment_id: string;
  status: string;
  total_amount: number | null;
  currency: string | null;
  checkout_session_id: string | null;
  metadata: Record<string, unknown> | null;
  product_cart: { product_id: string; quantity: number }[] | null;
};

export function getPayment(paymentId: string) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(paymentId)) throw new DodoError(400, "Invalid payment id");
  return call<DodoPayment>("GET", `/payments/${encodeURIComponent(paymentId)}`);
}

// ---------------------------------------------------------------------------
// Webhooks (Standard Webhooks)
// ---------------------------------------------------------------------------

export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

/**
 * Verifies `webhook-signature` over `${id}.${timestamp}.${rawBody}` with the
 * base64 secret after its `whsec_` prefix, and rejects stale timestamps.
 * The header may list several space-separated `v1,<sig>` values.
 */
export function verifyWebhook(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  now = Date.now(),
): void {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) throw new WebhookVerificationError("Missing webhook headers");
  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > WEBHOOK_TOLERANCE_SECONDS) {
    throw new WebhookVerificationError("Webhook timestamp outside tolerance");
  }
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();
  const ok = signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!ok) throw new WebhookVerificationError("Invalid webhook signature");
}

/** For tests and local tooling: sign like Dodo does. */
export function signWebhook(rawBody: string, id: string, timestamp: string, secret: string) {
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64")}`;
}

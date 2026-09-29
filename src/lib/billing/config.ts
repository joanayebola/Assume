import "server-only";

import { isDemoMode } from "@/lib/env";

/**
 * The one place that knows what Assume sells and for how much.
 *
 * Prices shown in the UI come from here (env), never hardcoded in
 * components. The amount actually charged is whatever the Dodo product is
 * set to — keep BILLING_*_PRICE in sync with the dashboard. If a price isn't
 * configured, the UI says "price shown at checkout" instead of guessing.
 *
 * Adding a subscription later = set DODO_PRODUCT_SUBSCRIPTION (+ price) and
 * the webhook starts granting 'subscription' entitlements; nothing else in
 * the app has to change shape.
 */

export type ProductKey = "routine" | "unlimited";
export type ProductKind = "one_time" | "subscription";

export type Price = { amount: number; currency: string; interval: "month" | "year" | null };

export type Product = {
  key: ProductKey;
  kind: ProductKind;
  providerProductId: string | null;
  price: Price | null;
};

/** Serializable, safe for the client. */
export type Offer = {
  key: ProductKey;
  kind: ProductKind;
  price: Price | null;
  available: boolean;
};

function price(amountVar: string | undefined, interval: Price["interval"] = null): Price | null {
  const amount = Number.parseInt(amountVar ?? "", 10);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const currency = (process.env.BILLING_CURRENCY || "USD").toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? { amount, currency, interval } : null;
}

export function products(): Record<ProductKey, Product> {
  return {
    routine: {
      key: "routine",
      kind: "one_time",
      providerProductId: process.env.DODO_PRODUCT_ROUTINE || null,
      price: price(process.env.BILLING_ROUTINE_PRICE),
    },
    unlimited: {
      key: "unlimited",
      kind: "subscription",
      providerProductId: process.env.DODO_PRODUCT_SUBSCRIPTION || null,
      price: price(process.env.BILLING_SUBSCRIPTION_PRICE, process.env.BILLING_SUBSCRIPTION_INTERVAL === "year" ? "year" : "month"),
    },
  };
}

export function productByProviderId(id: string): Product | null {
  return Object.values(products()).find((p) => p.providerProductId === id) ?? null;
}

export type BillingMode = "required" | "free";

/**
 * "required" (default): routines need a credit or subscription.
 * "free": anyone signed in can generate (self-hosting / private beta).
 * Fails closed — an unset or unknown value means payment is required.
 */
export function billingMode(): BillingMode {
  return process.env.BILLING_MODE === "free" ? "free" : "required";
}

/** How many free routines each account gets (default 0). */
export function freeRoutineCredits(): number {
  const n = Number.parseInt(process.env.FREE_ROUTINE_CREDITS ?? "0", 10);
  return n === 1 ? 1 : 0; // one free credit at most — see entitlement_grants_one_free
}

export function dodoEnv(): { apiKey: string; webhookKey: string | null; baseUrl: string; mode: "test_mode" | "live_mode" } | null {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  if (!apiKey) return null;
  const mode = process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode";
  return {
    apiKey,
    webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY || null,
    mode,
    baseUrl: mode === "live_mode" ? "https://live.dodopayments.com" : "https://test.dodopayments.com",
  };
}

/** Can people actually buy things here? Demo mode simulates checkout. */
export function checkoutAvailable(key: ProductKey = "routine"): boolean {
  if (isDemoMode()) return key === "routine";
  return Boolean(dodoEnv() && products()[key].providerProductId);
}

export function offers(): Offer[] {
  return Object.values(products()).map((p) => ({ key: p.key, kind: p.kind, price: p.price, available: checkoutAvailable(p.key) }));
}

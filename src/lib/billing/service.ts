import "server-only";

import { randomUUID } from "node:crypto";

import { track } from "@/lib/analytics/server";
import { getSiteUrl, isDemoMode } from "@/lib/env";
import { logError, logWarn } from "@/lib/log";
import { routes } from "@/lib/site";

import { checkoutAvailable, productByProviderId, products, type ProductKey } from "./config";
import { createCheckoutSession, getPayment, type DodoPayment } from "./dodo";
import { BillingNotConfiguredError, type BillingStore, type Purchase } from "./store";

/**
 * Checkout, confirmation and webhook handling. Payment state only ever
 * changes from (a) a signature-verified webhook or (b) a server-side lookup
 * of the payment at Dodo — never from query strings or the browser.
 */

export const MAX_CHECKOUTS_PER_HOUR = 10;

export class CheckoutLimitError extends Error {
  constructor() {
    super("Too many checkouts started");
    this.name = "CheckoutLimitError";
  }
}

export async function startCheckout(
  billing: BillingStore,
  p: { userId: string; email: string | null; name: string | null; productKey: ProductKey; intakeId: string | null },
): Promise<{ url: string }> {
  if (!checkoutAvailable(p.productKey)) throw new BillingNotConfiguredError("Checkout");
  if ((await billing.countPurchasesSince(p.userId, new Date(Date.now() - 3_600_000))) >= MAX_CHECKOUTS_PER_HOUR) {
    throw new CheckoutLimitError();
  }
  const product = products()[p.productKey];
  const site = getSiteUrl();

  if (isDemoMode()) {
    // Simulated checkout: no money moves. Only reachable in demo mode.
    const purchase = await billing.createPurchase(p.userId, { productKey: p.productKey, providerProductId: "demo_product", intakeId: p.intakeId });
    await billing.attachCheckoutSession(purchase.id, `demo_${randomUUID()}`);
    track("checkout_started", p.userId, { product: p.productKey });
    return { url: `${routes.checkoutSuccess}?purchase=${purchase.id}&demo=1` };
  }

  const purchase = await billing.createPurchase(p.userId, {
    productKey: p.productKey,
    providerProductId: product.providerProductId!,
    intakeId: p.intakeId,
  });
  const session = await createCheckoutSession({
    productId: product.providerProductId!,
    email: p.email,
    name: p.name,
    returnUrl: `${site}${routes.checkoutSuccess}?purchase=${purchase.id}`,
    cancelUrl: `${site}${routes.checkoutCancelled}?purchase=${purchase.id}`,
    // Only our own ids travel to the payment provider — no manifestation data.
    metadata: { purchase_id: purchase.id },
  });
  await billing.attachCheckoutSession(purchase.id, session.session_id);
  if (!session.checkout_url) throw new Error("[billing] checkout session has no URL");
  track("checkout_started", p.userId, { product: p.productKey });
  return { url: session.checkout_url };
}

export type ConfirmState = "paid" | "processing" | "failed" | "refunded" | "not_found";

/** Is the payment for this purchase settled? Asks Dodo directly if the webhook hasn't landed yet. */
export async function confirmPurchase(
  billing: BillingStore,
  p: { userId: string; purchaseId: string; paymentId: string | null; demo: boolean },
): Promise<{ state: ConfirmState; purchase: Purchase | null }> {
  const purchase = await billing.getPurchase(p.userId, p.purchaseId);
  if (!purchase || !purchase.checkoutSessionId) return { state: "not_found", purchase };
  if (purchase.status === "paid") return { state: "paid", purchase };
  if (purchase.status === "refunded") return { state: "refunded", purchase };

  if (isDemoMode()) {
    if (!p.demo || !purchase.checkoutSessionId.startsWith("demo_")) return { state: "processing", purchase };
    const r = await billing.fulfil({ checkoutSessionId: purchase.checkoutSessionId, paymentId: `demo_pay_${purchase.id}`, amount: null, currency: null });
    if (r.newlyPaid) track("purchase_completed", p.userId, { product: purchase.productKey });
    return { state: "paid", purchase: await billing.getPurchase(p.userId, p.purchaseId) };
  }

  if (!p.paymentId) return { state: purchase.status === "failed" || purchase.status === "cancelled" ? "failed" : "processing", purchase };

  let payment: DodoPayment;
  try {
    payment = await getPayment(p.paymentId);
  } catch (error) {
    logError("billing:confirm", error);
    return { state: "processing", purchase };
  }
  // The payment must belong to *this* checkout — a payment id from someone
  // else's (or an older) checkout can't unlock anything.
  if (payment.checkout_session_id !== purchase.checkoutSessionId) {
    logWarn("billing", "payment does not match purchase", { purchaseId: purchase.id });
    return { state: "processing", purchase };
  }
  if (payment.status === "succeeded") {
    await fulfilPayment(billing, payment);
    return { state: "paid", purchase: await billing.getPurchase(p.userId, p.purchaseId) };
  }
  if (payment.status === "failed" || payment.status === "cancelled") {
    await billing.setPurchaseStatus(purchase.id, payment.status === "failed" ? "failed" : "cancelled");
    return { state: "failed", purchase };
  }
  return { state: "processing", purchase };
}

async function fulfilPayment(billing: BillingStore, payment: DodoPayment) {
  if (!payment.checkout_session_id) throw new Error("[billing] payment without checkout session");
  const purchase = await billing.findPurchaseBySession(payment.checkout_session_id);
  if (!purchase) throw new Error("[billing] no purchase for checkout session");
  const expected = products()[purchase.productKey]?.providerProductId;
  if (expected && payment.product_cart && !payment.product_cart.some((i) => i.product_id === expected)) {
    throw new Error("[billing] paid product doesn't match purchase");
  }
  const r = await billing.fulfil({
    checkoutSessionId: payment.checkout_session_id,
    paymentId: payment.payment_id,
    amount: payment.total_amount ?? null,
    currency: payment.currency ?? null,
  });
  if (r.newlyPaid && r.userId) track("purchase_completed", r.userId, { product: purchase.productKey });
  return r;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export type WebhookEvent = { type: string; data: Record<string, unknown> };

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Apply one verified webhook event. Idempotent; throws to make Dodo retry. */
export async function handleWebhookEvent(billing: BillingStore, event: WebhookEvent): Promise<"handled" | "ignored"> {
  const d = event.data;
  switch (event.type) {
    case "payment.succeeded": {
      const payment: DodoPayment = {
        payment_id: str(d.payment_id) ?? "",
        status: str(d.status) ?? "succeeded",
        total_amount: typeof d.total_amount === "number" ? d.total_amount : null,
        currency: str(d.currency),
        checkout_session_id: str(d.checkout_session_id),
        metadata: (d.metadata as Record<string, unknown>) ?? null,
        product_cart: Array.isArray(d.product_cart) ? (d.product_cart as DodoPayment["product_cart"]) : null,
      };
      if (!payment.payment_id) throw new Error("[billing] payment.succeeded without payment_id");
      if (!payment.checkout_session_id) {
        // Not one of our checkouts (e.g. a subscription renewal charge).
        return "ignored";
      }
      if (!(await billing.findPurchaseBySession(payment.checkout_session_id))) return "ignored";
      await fulfilPayment(billing, payment);
      return "handled";
    }
    case "payment.failed":
    case "payment.cancelled": {
      const session = str(d.checkout_session_id);
      const purchase = session ? await billing.findPurchaseBySession(session) : null;
      if (!purchase) return "ignored";
      await billing.setPurchaseStatus(purchase.id, event.type === "payment.failed" ? "failed" : "cancelled");
      return "handled";
    }
    case "refund.succeeded": {
      const paymentId = str(d.payment_id);
      if (!paymentId) return "ignored";
      await billing.refund(paymentId);
      return "handled";
    }
    case "subscription.active":
    case "subscription.renewed":
    case "subscription.on_hold":
    case "subscription.cancelled":
    case "subscription.expired":
    case "subscription.failed": {
      // Future tier: grant/extend or end access. Only for a configured subscription product.
      const productId = str(d.product_id);
      const subscriptionId = str(d.subscription_id);
      if (!productId || !subscriptionId || productByProviderId(productId)?.kind !== "subscription") return "ignored";
      const session = str(d.checkout_session_id);
      const purchaseId = str((d.metadata as Record<string, unknown> | undefined)?.purchase_id);
      const purchase = session ? await billing.findPurchaseBySession(session) : null;
      const userId = purchase?.userId ?? null;
      if (!userId) {
        logWarn("billing", "subscription event without a known purchase", { hasPurchaseId: Boolean(purchaseId) });
        return "ignored";
      }
      const active = event.type === "subscription.active" || event.type === "subscription.renewed";
      await billing.upsertSubscription({ userId, providerSubscriptionId: subscriptionId, validUntil: str(d.next_billing_date), active });
      return "handled";
    }
    default:
      return "ignored";
  }
}

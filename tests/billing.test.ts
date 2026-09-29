import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { DemoBillingStore } from "@/lib/billing/demo-store";
import { signWebhook, verifyWebhook, WebhookVerificationError } from "@/lib/billing/dodo";
import { formatPrice } from "@/lib/billing/format";
import { handleWebhookEvent } from "@/lib/billing/service";
import { mutateDemo } from "@/lib/demo/store";
import { checkGenerationEntitlement, rateLimited, reserveInitialGeneration, workerEntitled } from "@/lib/entitlements";

const dir = mkdtempSync(path.join(tmpdir(), "assume-billing-"));
process.env.ASSUME_DEMO_DATA_DIR = dir;
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const SECRET = `whsec_${Buffer.from("super-secret-signing-key-0123456789").toString("base64")}`;
const USER = "user-billing";
const billing = new DemoBillingStore();

const env = { ...process.env };
beforeEach(async () => {
  await mutateDemo((s) => {
    s.purchases = [];
    s.grants = [];
    s.webhookEvents = {};
  });
  delete process.env.BILLING_MODE;
  delete process.env.FREE_ROUTINE_CREDITS;
  process.env.DODO_PRODUCT_ROUTINE = "pdt_routine";
});
afterEach(() => {
  process.env = { ...env };
});

async function pendingPurchase(session = "cks_1") {
  const p = await billing.createPurchase(USER, { productKey: "routine", providerProductId: "pdt_routine", intakeId: null });
  await billing.attachCheckoutSession(p.id, session);
  return p;
}

const succeeded = (session: string, paymentId = "pay_1", product = "pdt_routine") => ({
  type: "payment.succeeded",
  data: { payment_id: paymentId, status: "succeeded", total_amount: 1900, currency: "usd", checkout_session_id: session, product_cart: [{ product_id: product, quantity: 1 }] },
});

// ---------------------------------------------------------------------------

describe("webhook signatures (Standard Webhooks)", () => {
  const body = JSON.stringify({ type: "payment.succeeded", data: {} });
  const now = Date.UTC(2026, 8, 29, 12);
  const ts = String(Math.floor(now / 1000));

  it("accepts a correctly signed, fresh webhook", () => {
    const signature = signWebhook(body, "msg_1", ts, SECRET);
    expect(() => verifyWebhook(body, { id: "msg_1", timestamp: ts, signature }, SECRET, now)).not.toThrow();
  });

  it("accepts when one of several signatures matches (key rotation)", () => {
    const signature = `v1,bm90LWl0 ${signWebhook(body, "msg_1", ts, SECRET)}`;
    expect(() => verifyWebhook(body, { id: "msg_1", timestamp: ts, signature }, SECRET, now)).not.toThrow();
  });

  it("rejects a tampered body, wrong id, wrong secret or missing headers", () => {
    const signature = signWebhook(body, "msg_1", ts, SECRET);
    const check = (b: string, id: string | null, secret = SECRET, sig: string | null = signature) => () =>
      verifyWebhook(b, { id, timestamp: ts, signature: sig }, secret, now);
    expect(check(body.replace("succeeded", "failed"), "msg_1")).toThrow(WebhookVerificationError);
    expect(check(body, "msg_2")).toThrow(WebhookVerificationError);
    expect(check(body, "msg_1", `whsec_${Buffer.from("another-key").toString("base64")}`)).toThrow(WebhookVerificationError);
    expect(check(body, null)).toThrow(WebhookVerificationError);
    expect(check(body, "msg_1", SECRET, "v1,")).toThrow(WebhookVerificationError);
  });

  it("rejects replays outside the 5-minute window", () => {
    const old = String(Math.floor(now / 1000) - 6 * 60);
    const signature = signWebhook(body, "msg_1", old, SECRET);
    expect(() => verifyWebhook(body, { id: "msg_1", timestamp: old, signature }, SECRET, now)).toThrow(/tolerance/);
  });
});

describe("purchases and webhooks", () => {
  it("fulfils a paid checkout once, granting exactly one credit", async () => {
    const p = await pendingPurchase();
    await handleWebhookEvent(billing, succeeded("cks_1"));
    await handleWebhookEvent(billing, succeeded("cks_1")); // retry / duplicate
    const purchase = await billing.getPurchase(USER, p.id);
    expect(purchase).toMatchObject({ status: "paid", amount: 1900, currency: "USD" });
    expect((await billing.listGrants(USER)).filter((g) => g.kind === "routine_credit")).toHaveLength(1);
  });

  it("dedupes by webhook id", async () => {
    expect(await billing.beginWebhook("msg_x", "dodo", "payment.succeeded")).toBe(true);
    expect(await billing.beginWebhook("msg_x", "dodo", "payment.succeeded")).toBe(true); // not finished → retry allowed
    await billing.finishWebhook("msg_x");
    expect(await billing.beginWebhook("msg_x", "dodo", "payment.succeeded")).toBe(false);
  });

  it("ignores payments for checkouts that aren't ours", async () => {
    expect(await handleWebhookEvent(billing, succeeded("cks_someone_else"))).toBe("ignored");
    expect(await billing.listGrants(USER)).toEqual([]);
  });

  it("refuses to grant when the paid product doesn't match the purchase", async () => {
    await pendingPurchase();
    await expect(handleWebhookEvent(billing, succeeded("cks_1", "pay_1", "pdt_something_cheaper"))).rejects.toThrow(/doesn't match/);
    expect(await billing.listGrants(USER)).toEqual([]);
  });

  it("marks failed payments without granting anything", async () => {
    const p = await pendingPurchase();
    await handleWebhookEvent(billing, { type: "payment.failed", data: { checkout_session_id: "cks_1" } });
    expect((await billing.getPurchase(USER, p.id))?.status).toBe("failed");
    expect(await billing.listGrants(USER)).toEqual([]);
  });

  it("a refund revokes an unused credit but never a built routine", async () => {
    await pendingPurchase("cks_a");
    await pendingPurchase("cks_b");
    await handleWebhookEvent(billing, succeeded("cks_a", "pay_a"));
    await handleWebhookEvent(billing, succeeded("cks_b", "pay_b"));
    // Spend one credit on a routine.
    const spent = await billing.reserveCredit(USER);
    await billing.consumeCredit(spent!, "req_1");
    const spentPurchase = (await billing.listGrants(USER)).find((g) => g.id === spent);
    await handleWebhookEvent(billing, { type: "refund.succeeded", data: { payment_id: "pay_a" } });
    await handleWebhookEvent(billing, { type: "refund.succeeded", data: { payment_id: "pay_b" } });
    const grants = await billing.listGrants(USER);
    expect(grants.find((g) => g.id === spent)?.status).toBe("consumed");
    expect(grants.filter((g) => g.id !== spentPurchase?.id).map((g) => g.status)).toEqual(["revoked"]);
  });

  it("ignores subscription events when no subscription product is configured", async () => {
    expect(await handleWebhookEvent(billing, { type: "subscription.active", data: { product_id: "pdt_x", subscription_id: "sub_1" } })).toBe("ignored");
  });
});

describe("entitlements", () => {
  it("requires payment for a new routine by default", async () => {
    const e = await checkGenerationEntitlement(billing, USER, "initial", { requestsLast24h: 0 });
    expect(e).toMatchObject({ allowed: false, reason: "payment_required" });
    expect(await reserveInitialGeneration(billing, USER)).toMatchObject({ ok: false });
  });

  it("includes adjustments of a routine you already have", async () => {
    expect(await checkGenerationEntitlement(billing, USER, "adjust", { requestsLast24h: 0 })).toMatchObject({ allowed: true, via: "included" });
  });

  it("spends a credit exactly once, even with concurrent submissions", async () => {
    await pendingPurchase();
    await handleWebhookEvent(billing, succeeded("cks_1"));
    const [a, b] = await Promise.all([reserveInitialGeneration(billing, USER), reserveInitialGeneration(billing, USER)]);
    const winners = [a, b].filter((r) => r.ok && r.grantId);
    expect(winners).toHaveLength(1);
    expect([a, b].filter((r) => !r.ok)).toHaveLength(1);
  });

  it("gives a credit back when released (e.g. a routine that can't be built)", async () => {
    await pendingPurchase();
    await handleWebhookEvent(billing, succeeded("cks_1"));
    const r = await reserveInitialGeneration(billing, USER);
    if (!r.ok || !r.grantId) throw new Error("expected a credit");
    await billing.consumeCredit(r.grantId, "req_1");
    expect(await workerEntitled(billing, { id: "req_1", userId: USER, kind: "initial" })).toBe(true);
    await billing.releaseCredit(r.grantId);
    expect(await workerEntitled(billing, { id: "req_1", userId: USER, kind: "initial" })).toBe(false);
    expect(await reserveInitialGeneration(billing, USER)).toMatchObject({ ok: true });
  });

  it("the worker refuses an initial request nobody paid for", async () => {
    expect(await workerEntitled(billing, { id: "req_unpaid", userId: USER, kind: "initial" })).toBe(false);
  });

  it("grants one free routine when configured — once", async () => {
    process.env.FREE_ROUTINE_CREDITS = "1";
    const first = await reserveInitialGeneration(billing, USER);
    expect(first).toMatchObject({ ok: true });
    await billing.consumeCredit((first as { grantId: string }).grantId, "req_free");
    expect(await reserveInitialGeneration(billing, USER)).toMatchObject({ ok: false });
  });

  it("BILLING_MODE=free lets everyone generate without credits", async () => {
    process.env.BILLING_MODE = "free";
    expect(await reserveInitialGeneration(billing, USER)).toEqual({ ok: true, grantId: null });
    expect(await workerEntitled(billing, { id: "r", userId: USER, kind: "initial" })).toBe(true);
  });

  it("fails closed on unknown billing modes", async () => {
    process.env.BILLING_MODE = "maybe";
    expect(await reserveInitialGeneration(billing, USER)).toMatchObject({ ok: false });
  });

  it("an active subscription covers new routines without spending credits", async () => {
    await billing.upsertSubscription({ userId: USER, providerSubscriptionId: "sub_1", validUntil: new Date(Date.now() + 86_400_000).toISOString(), active: true });
    expect(await reserveInitialGeneration(billing, USER)).toEqual({ ok: true, grantId: null });
    await billing.upsertSubscription({ userId: USER, providerSubscriptionId: "sub_1", validUntil: null, active: false });
    expect(await reserveInitialGeneration(billing, USER)).toMatchObject({ ok: false });
  });

  it("rate-limits bursts and daily volume", () => {
    expect(rateLimited({ requestsLast24h: 30 })?.reason).toBe("limit_reached");
    expect(rateLimited({ requestsLast24h: 3, requestsLastBurst: 6 })?.reason).toBe("limit_reached");
    expect(rateLimited({ requestsLast24h: 3, requestsLastBurst: 2 })).toBeNull();
  });
});

describe("price display", () => {
  it("formats configured prices and admits when there isn't one", () => {
    expect(formatPrice({ amount: 1900, currency: "USD" })).toBe("$19");
    expect(formatPrice({ amount: 1250, currency: "EUR" })).toBe("€12.50");
    expect(formatPrice({ amount: 900, currency: "GBP", interval: "month" })).toBe("£9/mo");
    expect(formatPrice(null)).toBeNull();
  });
});

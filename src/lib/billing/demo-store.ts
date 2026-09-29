import "server-only";

import { randomUUID } from "node:crypto";

import { loadDemo, mutateDemo, type DemoStore } from "@/lib/demo/store";

import type { ProductKey } from "./config";
import type { BillingStore, Grant, Purchase } from "./store";

type DemoGrant = DemoStore["grants"][number];

const toGrant = (g: DemoGrant): Grant => ({
  id: g.id,
  kind: g.kind,
  status: g.status,
  requestId: g.requestId,
  validUntil: g.validUntil,
  createdAt: g.createdAt,
});

const toPurchase = ({ providerPaymentId: _p, ...rest }: DemoStore["purchases"][number]): Purchase => {
  void _p;
  return rest;
};

/** Demo-mode billing: same semantics as the SQL functions, against the local file. */
export class DemoBillingStore implements BillingStore {
  async listPurchases(userId: string) {
    return (await loadDemo()).purchases.filter((p) => p.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toPurchase);
  }

  async getPurchase(userId: string, id: string) {
    const p = (await loadDemo()).purchases.find((x) => x.id === id && x.userId === userId);
    return p ? toPurchase(p) : null;
  }

  async listGrants(userId: string) {
    return (await loadDemo()).grants.filter((g) => g.userId === userId).map(toGrant);
  }

  createPurchase(userId: string, p: { productKey: ProductKey; providerProductId: string; intakeId: string | null }) {
    return mutateDemo((s) => {
      const row = {
        id: randomUUID(),
        userId,
        productKey: p.productKey,
        status: "pending" as const,
        amount: null,
        currency: null,
        intakeId: p.intakeId,
        checkoutSessionId: null,
        providerPaymentId: null,
        createdAt: new Date().toISOString(),
        paidAt: null,
        refundedAt: null,
      };
      s.purchases.push(row);
      return toPurchase(row);
    });
  }

  async attachCheckoutSession(purchaseId: string, sessionId: string) {
    await mutateDemo((s) => {
      const p = s.purchases.find((x) => x.id === purchaseId);
      if (p) p.checkoutSessionId = sessionId;
    });
  }

  async setPurchaseStatus(purchaseId: string, status: "failed" | "cancelled") {
    await mutateDemo((s) => {
      const p = s.purchases.find((x) => x.id === purchaseId);
      if (p?.status === "pending") p.status = status;
    });
  }

  async countPurchasesSince(userId: string, since: Date) {
    return (await loadDemo()).purchases.filter((p) => p.userId === userId && Date.parse(p.createdAt) >= since.getTime()).length;
  }

  async findPurchaseBySession(sessionId: string) {
    const p = (await loadDemo()).purchases.find((x) => x.checkoutSessionId === sessionId);
    return p ? toPurchase(p) : null;
  }

  fulfil(p: { checkoutSessionId: string; paymentId: string; amount: number | null; currency: string | null }) {
    return mutateDemo((s) => {
      const purchase = s.purchases.find((x) => x.checkoutSessionId === p.checkoutSessionId);
      if (!purchase) throw new Error("purchase not found");
      let newlyPaid = false;
      if (purchase.status === "pending" || purchase.status === "failed" || purchase.status === "cancelled") {
        Object.assign(purchase, {
          status: "paid",
          providerPaymentId: purchase.providerPaymentId ?? p.paymentId,
          amount: p.amount ?? purchase.amount,
          currency: p.currency?.toUpperCase() ?? purchase.currency,
          paidAt: new Date().toISOString(),
        });
        newlyPaid = true;
      }
      if (purchase.userId && purchase.status !== "refunded" && !s.grants.some((g) => g.purchaseId === purchase.id)) {
        s.grants.push({
          id: randomUUID(),
          userId: purchase.userId,
          kind: "routine_credit",
          status: "available",
          purchaseId: purchase.id,
          requestId: null,
          validUntil: null,
          providerSubscriptionId: null,
          createdAt: new Date().toISOString(),
        });
      }
      return { purchaseId: purchase.id, userId: purchase.userId, newlyPaid };
    });
  }

  async refund(paymentId: string) {
    await mutateDemo((s) => {
      const p = s.purchases.find((x) => x.providerPaymentId === paymentId);
      if (!p) return;
      Object.assign(p, { status: "refunded", refundedAt: new Date().toISOString() });
      for (const g of s.grants) if (g.purchaseId === p.id && (g.status === "available" || g.status === "reserved")) g.status = "revoked";
    });
  }

  async ensureFreeCredit(userId: string) {
    await mutateDemo((s) => {
      if (s.grants.some((g) => g.userId === userId && g.kind === "free_credit")) return;
      s.grants.push({
        id: randomUUID(),
        userId,
        kind: "free_credit",
        status: "available",
        purchaseId: null,
        requestId: null,
        validUntil: null,
        providerSubscriptionId: null,
        createdAt: new Date().toISOString(),
      });
    });
  }

  reserveCredit(userId: string) {
    return mutateDemo((s) => {
      const g = s.grants
        .filter((x) => x.userId === userId && (x.kind === "routine_credit" || x.kind === "free_credit") && x.status === "available")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (!g) return null;
      g.status = "reserved";
      return g.id;
    });
  }

  async consumeCredit(grantId: string, requestId: string) {
    await mutateDemo((s) => {
      const g = s.grants.find((x) => x.id === grantId);
      if (g && (g.status === "reserved" || g.status === "consumed")) Object.assign(g, { status: "consumed", requestId });
    });
  }

  async releaseCredit(grantId: string) {
    await mutateDemo((s) => {
      const g = s.grants.find((x) => x.id === grantId);
      if (g && (g.status === "reserved" || g.status === "consumed")) Object.assign(g, { status: "available", requestId: null });
    });
  }

  async creditForRequest(requestId: string) {
    const g = (await loadDemo()).grants.find((x) => x.requestId === requestId);
    return g ? toGrant(g) : null;
  }

  async activeSubscription(userId: string, now = new Date()) {
    const g = (await loadDemo()).grants.find(
      (x) => x.userId === userId && x.kind === "subscription" && x.status === "available" && x.validUntil && Date.parse(x.validUntil) > now.getTime(),
    );
    return g ? toGrant(g) : null;
  }

  async upsertSubscription(p: { userId: string; providerSubscriptionId: string; validUntil: string | null; active: boolean }) {
    await mutateDemo((s) => {
      const existing = s.grants.find((g) => g.providerSubscriptionId === p.providerSubscriptionId);
      const status = p.active ? ("available" as const) : ("revoked" as const);
      if (existing) Object.assign(existing, { validUntil: p.validUntil, status });
      else
        s.grants.push({
          id: randomUUID(),
          userId: p.userId,
          kind: "subscription",
          status,
          purchaseId: null,
          requestId: null,
          validUntil: p.validUntil,
          providerSubscriptionId: p.providerSubscriptionId,
          createdAt: new Date().toISOString(),
        });
    });
  }

  beginWebhook(id: string, _provider: string, type: string) {
    return mutateDemo((s) => {
      const e = s.webhookEvents[id];
      if (e?.processedAt) return false;
      s.webhookEvents[id] = { type, processedAt: null };
      return true;
    });
  }

  async finishWebhook(id: string) {
    await mutateDemo((s) => {
      if (s.webhookEvents[id]) s.webhookEvents[id].processedAt = new Date().toISOString();
    });
  }
}

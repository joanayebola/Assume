import type { Enums } from "@/types/database";

import type { ProductKey } from "./config";

/**
 * Persistence for purchases and entitlements. Reads are user-scoped (RLS);
 * every write is privileged and keyed by ids the server verified — never by
 * anything the browser claims.
 */

export type PurchaseStatus = Enums<"purchase_status">;

export type Purchase = {
  id: string;
  userId: string | null;
  productKey: ProductKey;
  status: PurchaseStatus;
  amount: number | null;
  currency: string | null;
  intakeId: string | null;
  checkoutSessionId: string | null;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
};

export type Grant = {
  id: string;
  kind: Enums<"grant_kind">;
  status: Enums<"grant_status">;
  requestId: string | null;
  validUntil: string | null;
  createdAt: string;
};

export type FulfilResult = { purchaseId: string; userId: string | null; newlyPaid: boolean };

export interface BillingStore {
  // ---- user-scoped reads ---------------------------------------------------
  listPurchases(userId: string): Promise<Purchase[]>;
  getPurchase(userId: string, purchaseId: string): Promise<Purchase | null>;
  listGrants(userId: string): Promise<Grant[]>;

  // ---- privileged ------------------------------------------------------------
  createPurchase(userId: string, p: { productKey: ProductKey; providerProductId: string; intakeId: string | null }): Promise<Purchase>;
  attachCheckoutSession(purchaseId: string, sessionId: string): Promise<void>;
  setPurchaseStatus(purchaseId: string, status: Extract<PurchaseStatus, "failed" | "cancelled">): Promise<void>;
  countPurchasesSince(userId: string, since: Date): Promise<number>;
  findPurchaseBySession(sessionId: string): Promise<Purchase | null>;
  fulfil(p: { checkoutSessionId: string; paymentId: string; amount: number | null; currency: string | null }): Promise<FulfilResult>;
  refund(paymentId: string): Promise<void>;

  ensureFreeCredit(userId: string): Promise<void>;
  reserveCredit(userId: string): Promise<string | null>;
  consumeCredit(grantId: string, requestId: string): Promise<void>;
  releaseCredit(grantId: string): Promise<void>;
  creditForRequest(requestId: string): Promise<Grant | null>;
  activeSubscription(userId: string, now?: Date): Promise<Grant | null>;
  upsertSubscription(p: { userId: string; providerSubscriptionId: string; validUntil: string | null; active: boolean }): Promise<void>;

  /** True if this webhook id hasn't been processed yet. */
  beginWebhook(id: string, provider: string, type: string): Promise<boolean>;
  finishWebhook(id: string): Promise<void>;
}

export class BillingNotConfiguredError extends Error {
  constructor(what: string) {
    super(`${what} is not configured`);
    this.name = "BillingNotConfiguredError";
  }
}

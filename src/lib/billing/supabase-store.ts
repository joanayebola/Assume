import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "@/types/database";

import type { ProductKey } from "./config";
import { BillingNotConfiguredError, type BillingStore, type Grant, type Purchase } from "./store";

type Client = SupabaseClient<Database>;

function fail(context: string, error: { message: string; code?: string } | null): never {
  throw new Error(`[billing:${context}] ${error?.code ?? ""} ${error?.message ?? "unknown error"}`);
}

const toPurchase = (r: Tables<"purchases">): Purchase => ({
  id: r.id,
  userId: r.user_id,
  productKey: r.product_key as ProductKey,
  status: r.status,
  amount: r.amount,
  currency: r.currency,
  intakeId: r.intake_id,
  checkoutSessionId: r.checkout_session_id,
  createdAt: r.created_at,
  paidAt: r.paid_at,
  refundedAt: r.refunded_at,
});

const toGrant = (r: Tables<"entitlement_grants">): Grant => ({
  id: r.id,
  kind: r.kind,
  status: r.status,
  requestId: r.request_id,
  validUntil: r.valid_until,
  createdAt: r.created_at,
});

/** `db` = the user's RLS client (null in webhooks); `admin` = service role. */
export class SupabaseBillingStore implements BillingStore {
  constructor(
    private readonly db: Client | null,
    private readonly adminClient: Client | null,
  ) {}

  private get admin(): Client {
    if (!this.adminClient) throw new BillingNotConfiguredError("SUPABASE_SECRET_KEY");
    return this.adminClient;
  }

  private get user(): Client {
    if (!this.db) throw new Error("[billing] no user client");
    return this.db;
  }

  async listPurchases(userId: string) {
    const { data, error } = await this.user.from("purchases").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
    if (error) fail("purchases", error);
    return data.map(toPurchase);
  }

  async getPurchase(userId: string, purchaseId: string) {
    const { data, error } = await this.user.from("purchases").select("*").eq("user_id", userId).eq("id", purchaseId).maybeSingle();
    if (error) fail("purchase", error);
    return data ? toPurchase(data) : null;
  }

  async listGrants(userId: string) {
    const { data, error } = await this.user.from("entitlement_grants").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) fail("grants", error);
    return data.map(toGrant);
  }

  async createPurchase(userId: string, p: { productKey: ProductKey; providerProductId: string; intakeId: string | null }) {
    const { data, error } = await this.admin
      .from("purchases")
      .insert({ user_id: userId, product_key: p.productKey, provider_product_id: p.providerProductId, intake_id: p.intakeId })
      .select("*")
      .single();
    if (error) fail("create", error);
    return toPurchase(data);
  }

  async attachCheckoutSession(purchaseId: string, sessionId: string) {
    const { error } = await this.admin.from("purchases").update({ checkout_session_id: sessionId }).eq("id", purchaseId);
    if (error) fail("attach", error);
  }

  async setPurchaseStatus(purchaseId: string, status: "failed" | "cancelled") {
    const { error } = await this.admin.from("purchases").update({ status }).eq("id", purchaseId).eq("status", "pending");
    if (error) fail("status", error);
  }

  async countPurchasesSince(userId: string, since: Date) {
    const { count, error } = await this.admin
      .from("purchases")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since.toISOString());
    if (error) fail("count", error);
    return count ?? 0;
  }

  async findPurchaseBySession(sessionId: string) {
    const { data, error } = await this.admin.from("purchases").select("*").eq("checkout_session_id", sessionId).maybeSingle();
    if (error) fail("by-session", error);
    return data ? toPurchase(data) : null;
  }

  async fulfil(p: { checkoutSessionId: string; paymentId: string; amount: number | null; currency: string | null }) {
    const { data, error } = await this.admin.rpc("fulfil_purchase", {
      p_checkout_session_id: p.checkoutSessionId,
      p_payment_id: p.paymentId,
      p_amount: p.amount,
      p_currency: p.currency,
    });
    if (error) fail("fulfil", error);
    const row = data?.[0];
    if (!row) throw new Error("[billing:fulfil] no result");
    return { purchaseId: row.purchase_id, userId: row.user_id, newlyPaid: row.newly_paid };
  }

  async refund(paymentId: string) {
    const { error } = await this.admin.rpc("refund_purchase", { p_payment_id: paymentId });
    if (error) fail("refund", error);
  }

  async ensureFreeCredit(userId: string) {
    const { data, error } = await this.admin.from("entitlement_grants").select("id").eq("user_id", userId).eq("kind", "free_credit").maybeSingle();
    if (error) fail("free:get", error);
    if (data) return;
    // A unique violation means a concurrent request already created it.
    const { error: insertError } = await this.admin.from("entitlement_grants").insert({ user_id: userId, kind: "free_credit" });
    if (insertError && insertError.code !== "23505") fail("free:insert", insertError);
  }

  async reserveCredit(userId: string) {
    const { data, error } = await this.admin.rpc("reserve_generation_credit", { p_user_id: userId });
    if (error) fail("reserve", error);
    return data ?? null;
  }

  async consumeCredit(grantId: string, requestId: string) {
    const { error } = await this.admin.rpc("consume_generation_credit", { p_grant_id: grantId, p_request_id: requestId });
    if (error) fail("consume", error);
  }

  async releaseCredit(grantId: string) {
    const { error } = await this.admin.rpc("release_generation_credit", { p_grant_id: grantId });
    if (error) fail("release", error);
  }

  async creditForRequest(requestId: string) {
    const { data, error } = await this.admin.from("entitlement_grants").select("*").eq("request_id", requestId).maybeSingle();
    if (error) fail("for-request", error);
    return data ? toGrant(data) : null;
  }

  async activeSubscription(userId: string, now = new Date()) {
    const { data, error } = await this.admin
      .from("entitlement_grants")
      .select("*")
      .eq("user_id", userId)
      .eq("kind", "subscription")
      .eq("status", "available")
      .gt("valid_until", now.toISOString())
      .order("valid_until", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) fail("subscription", error);
    return data ? toGrant(data) : null;
  }

  async upsertSubscription(p: { userId: string; providerSubscriptionId: string; validUntil: string | null; active: boolean }) {
    const { error } = await this.admin.from("entitlement_grants").upsert(
      {
        user_id: p.userId,
        kind: "subscription",
        provider_subscription_id: p.providerSubscriptionId,
        valid_until: p.validUntil,
        status: p.active ? "available" : "revoked",
      },
      { onConflict: "provider_subscription_id" },
    );
    if (error) fail("subscription:upsert", error);
  }

  async beginWebhook(id: string, provider: string, type: string) {
    const { data: existing, error } = await this.admin.from("webhook_events").select("processed_at").eq("id", id).maybeSingle();
    if (error) fail("webhook:get", error);
    if (existing?.processed_at) return false;
    if (!existing) {
      const { error: insertError } = await this.admin.from("webhook_events").insert({ id, provider, type });
      if (insertError && insertError.code !== "23505") fail("webhook:insert", insertError);
    }
    return true;
  }

  async finishWebhook(id: string) {
    const { error } = await this.admin.from("webhook_events").update({ processed_at: new Date().toISOString() }).eq("id", id);
    if (error) fail("webhook:finish", error);
  }
}

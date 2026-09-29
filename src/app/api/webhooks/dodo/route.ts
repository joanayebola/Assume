import { NextResponse, type NextRequest } from "next/server";

import { getPrivilegedBillingStore } from "@/lib/billing";
import { dodoEnv } from "@/lib/billing/config";
import { verifyWebhook, WebhookVerificationError } from "@/lib/billing/dodo";
import { handleWebhookEvent } from "@/lib/billing/service";
import { logError, logWarn } from "@/lib/log";

/**
 * POST ← Dodo Payments webhooks (Standard Webhooks).
 *  1. Verify the signature over the *raw* body, reject stale timestamps.
 *  2. Skip webhook ids already processed (retries, duplicates).
 *  3. Apply the event; mark processed only on success so failures retry.
 * Responds 2xx only when the event is safely handled or deliberately ignored.
 */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = dodoEnv()?.webhookKey;
  if (!secret) {
    logWarn("webhook:dodo", "DODO_PAYMENTS_WEBHOOK_KEY is not set");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const raw = await request.text();
  const id = request.headers.get("webhook-id");
  try {
    verifyWebhook(raw, { id, timestamp: request.headers.get("webhook-timestamp"), signature: request.headers.get("webhook-signature") }, secret);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      logWarn("webhook:dodo", error.message);
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }
    throw error;
  }

  let event: { type?: unknown; data?: unknown };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const type = typeof event.type === "string" ? event.type : "unknown";
  const data = event.data && typeof event.data === "object" ? (event.data as Record<string, unknown>) : {};

  const billing = getPrivilegedBillingStore();
  try {
    if (!(await billing.beginWebhook(id!, "dodo", type))) return NextResponse.json({ ok: true, duplicate: true });
    const outcome = await handleWebhookEvent(billing, { type, data });
    await billing.finishWebhook(id!);
    return NextResponse.json({ ok: true, outcome });
  } catch (error) {
    logError("webhook:dodo", error, { type });
    // Not marked processed → Dodo retries with backoff.
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}

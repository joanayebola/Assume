# Billing & entitlements

## Model

| Tier | What you get |
| --- | --- |
| Free | Account, the full intake (answers saved), a preview of what Assume does. Optionally one free routine (`FREE_ROUTINE_CREDITS=1`). |
| Routine (one-time) | One personalised routine credit. Adjusting, editing, regenerating sessions and calendar export for that routine are included (rate-limited). |
| Subscription (future) | Unlimited new routines while active. Wired end to end; switched on by setting `DODO_PRODUCT_SUBSCRIPTION`. |

Prices are configured in one place — `src/lib/billing/config.ts`, fed by env — and never hardcoded in UI. If no display price is configured the UI says "price shown at checkout".

## Entitlements (`entitlement_grants`)

One row per credit (`routine_credit`, `free_credit`) or subscription. Credits move **available → reserved → consumed** via service-role SQL functions:

1. `submitIntake` rate-limits, then `reserve_generation_credit` (row lock + `skip locked`: two concurrent submits can't take the same credit).
2. The intake is frozen and a request created; the credit is **consumed** against that request id (unique). If submission fails, the credit is released; if a concurrent submit already paid for the request, the extra reservation is released.
3. The worker re-checks (`workerEntitled`) **before calling Gemini**: initial requests need a consumed credit for that request, an active subscription, or `BILLING_MODE=free`.
4. If a routine can never be built (non-retryable failure or attempts exhausted), the credit is released automatically.

Users can read their purchases and grants; they can't write either.

## Checkout flow

```
Review step → submitIntake → payment_required → /checkout?intake=…
  → beginCheckout (server): pending purchase row → Dodo POST /checkouts
      (metadata: purchase_id only — no personal data) → redirect to Dodo
  → Dodo → /checkout/success?purchase=…&payment_id=…
      → confirmPurchase: purchase paid? else GET /payments/{id} at Dodo,
        require checkout_session_id match + status succeeded → fulfil_purchase()
      → BuildRoutineButton auto-submits the intake → /plans/generating/…
  → (cancel) /checkout/cancelled
```

The query string is only a hint; nothing unlocks without either a verified webhook or a server-side payment lookup whose checkout session matches the purchase.

## Webhooks — `POST /api/webhooks/dodo`

1. Verify `webhook-signature` (HMAC-SHA256 over `id.timestamp.rawBody`, base64 secret after `whsec_`), constant-time compare, ±5 min timestamp tolerance.
2. Idempotency: `webhook_events` by `webhook-id`; marked processed only after success so failures are retried by Dodo.
3. Events: `payment.succeeded` (fulfil; product id must match), `payment.failed` / `payment.cancelled`, `refund.succeeded` (revoke unused credit; a built routine stays), `subscription.*` (future tier). Unknown events are acknowledged and ignored.

`fulfil_purchase` is idempotent: however many times the webhook and success page race, a purchase is paid once and grants one credit (`entitlement_grants.purchase_id` is unique).

## Rate limits

- Generation: 30 requests/day and 6 per 10 minutes per user (database counts, so they hold across serverless instances).
- Checkout creation: 10 per hour per user.
- Analytics endpoint: best-effort per-IP limiter.

## Testing payments

Use Dodo **test mode** keys and a test product, register a test-mode webhook endpoint (use a tunnel locally). Demo mode (no Supabase) simulates checkout entirely. `tests/billing.test.ts` covers signatures, idempotency, refunds, product mismatch, credit double-spend and the free/subscription modes.

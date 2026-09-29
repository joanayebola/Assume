import "server-only";

import { billingMode, freeRoutineCredits } from "@/lib/billing/config";
import type { BillingStore } from "@/lib/billing/store";
import type { ClaimedRequest, GenerationKind } from "@/lib/plan/store";

/**
 * Who may trigger AI generation, and how often.
 *
 *  • A new routine ("initial") needs an entitlement: a routine credit (one-time
 *    purchase or configured free credit), an active subscription, or
 *    BILLING_MODE=free. The credit is *reserved* when the intake is submitted
 *    and *consumed* against that request, so it can't be spent twice.
 *  • Adjusting or regenerating parts of a routine you already have is
 *    included — limited only by the rate limits below.
 *  • The worker re-checks before calling Gemini (authoritative), so a request
 *    that somehow skipped the gate still can't generate.
 *
 * Rate limits protect cost and abuse regardless of plan.
 */

export const DAILY_GENERATION_LIMIT = 30;
export const BURST_GENERATION_LIMIT = 6;
export const BURST_WINDOW_MS = 10 * 60_000;

export type Usage = { requestsLast24h: number; requestsLastBurst?: number };

export type Entitlement =
  | { allowed: true; via: "free_mode" | "subscription" | "credit" | "included" }
  | { allowed: false; reason: "limit_reached" | "payment_required"; message: string };

export function rateLimited(usage: Usage): Extract<Entitlement, { allowed: false }> | null {
  if (usage.requestsLast24h >= DAILY_GENERATION_LIMIT) {
    return { allowed: false, reason: "limit_reached", message: "You've made a lot of changes today. Try again tomorrow — your current routine is saved." };
  }
  if ((usage.requestsLastBurst ?? 0) >= BURST_GENERATION_LIMIT) {
    return { allowed: false, reason: "limit_reached", message: "That's a lot of changes in a few minutes. Give it a little while, then try again." };
  }
  return null;
}

const PAYMENT_REQUIRED = {
  allowed: false,
  reason: "payment_required",
  message: "Building a personalised routine is a one-time purchase.",
} as const;

async function hasCredit(billing: BillingStore, userId: string) {
  if (freeRoutineCredits() > 0) await billing.ensureFreeCredit(userId);
  const grants = await billing.listGrants(userId);
  return grants.some((g) => (g.kind === "routine_credit" || g.kind === "free_credit") && g.status === "available");
}

/** Fast feedback before creating a request. Doesn't reserve anything. */
export async function checkGenerationEntitlement(
  billing: BillingStore,
  userId: string,
  kind: GenerationKind,
  usage: Usage,
): Promise<Entitlement> {
  const limited = rateLimited(usage);
  if (limited) return limited;
  if (kind !== "initial") return { allowed: true, via: "included" };
  if (billingMode() === "free") return { allowed: true, via: "free_mode" };
  if (await billing.activeSubscription(userId)) return { allowed: true, via: "subscription" };
  return (await hasCredit(billing, userId)) ? { allowed: true, via: "credit" } : PAYMENT_REQUIRED;
}

/**
 * Reserve what pays for a new routine. Returns the reserved credit (or null
 * when no credit is needed). Callers must consume it against the request —
 * or release it if the submission fails.
 */
export async function reserveInitialGeneration(
  billing: BillingStore,
  userId: string,
): Promise<{ ok: true; grantId: string | null } | { ok: false; message: string }> {
  if (billingMode() === "free") return { ok: true, grantId: null };
  if (await billing.activeSubscription(userId)) return { ok: true, grantId: null };
  if (freeRoutineCredits() > 0) await billing.ensureFreeCredit(userId);
  const grantId = await billing.reserveCredit(userId);
  return grantId ? { ok: true, grantId } : { ok: false, message: PAYMENT_REQUIRED.message };
}

/** Authoritative check in the worker, right before Gemini is called. */
export async function workerEntitled(billing: BillingStore, req: Pick<ClaimedRequest, "id" | "userId" | "kind">): Promise<boolean> {
  if (req.kind !== "initial") return true;
  if (billingMode() === "free") return true;
  const credit = await billing.creditForRequest(req.id);
  if (credit && credit.status === "consumed") return true;
  return Boolean(await billing.activeSubscription(req.userId));
}

import { CalendarCheck2, CircleAlert, Hourglass } from "lucide-react";
import type { Metadata } from "next";
import { z } from "zod";

import { BuildRoutineButton, ConfirmPoller } from "@/components/billing/checkout-actions";
import { FlowHeader } from "@/components/billing/flow-header";
import { ButtonLink } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getViewer } from "@/lib/auth/session";
import { getBillingStore } from "@/lib/billing";
import { confirmPurchase, type ConfirmState } from "@/lib/billing/service";
import { logError } from "@/lib/log";
import { routes } from "@/lib/site";

export const metadata: Metadata = { title: "Payment" };

/**
 * Where Dodo sends people after paying. The query string is only a hint:
 * the purchase is confirmed server-side (webhook, or a direct lookup of the
 * payment at Dodo) before anything unlocks.
 */
export default async function CheckoutSuccessPage({ searchParams }: PageProps<"/checkout/success">) {
  const q = await searchParams;
  const viewer = await getViewer();
  const purchaseId = typeof q.purchase === "string" && z.uuid().safeParse(q.purchase).success ? q.purchase : null;
  const paymentId = typeof q.payment_id === "string" ? q.payment_id : null;

  let state: ConfirmState = "not_found";
  let intakeId: string | null = null;
  if (purchaseId) {
    try {
      const r = await confirmPurchase(await getBillingStore(), { userId: viewer.user.id, purchaseId, paymentId, demo: q.demo === "1" });
      state = r.state;
      intakeId = r.purchase?.intakeId ?? null;
    } catch (error) {
      logError("checkout:confirm", error);
      state = "processing";
    }
  }

  return (
    <>
      <FlowHeader />
      <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-gutter py-12 sm:px-6">
        {state === "paid" && (
          <div className="animate-rise">
            <div className="flex items-center gap-4 rounded-xl border-2 border-ink bg-accent p-5 shadow-hard-md">
              <span className="grid size-12 shrink-0 place-items-center rounded-md border-2 border-ink bg-surface">
                <CalendarCheck2 className="size-6" aria-hidden />
              </span>
              <p className="font-display text-2xl font-bold leading-tight">Payment received. Thank you.</p>
            </div>
            <h1 className="mt-8 text-display-sm font-extrabold">Now, your routine.</h1>
            {intakeId ? (
              <>
                <p className="mt-3 text-lg leading-relaxed text-muted-foreground">We&apos;re starting on it now — it takes about a minute.</p>
                <div className="mt-8">
                  <BuildRoutineButton intakeId={intakeId} auto />
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-lg leading-relaxed text-muted-foreground">Your routine credit is ready. Start a plan whenever you like.</p>
                <ButtonLink href={routes.newPlan} size="lg" className="mt-8">
                  Start my plan
                </ButtonLink>
              </>
            )}
          </div>
        )}

        {state === "processing" && (
          <div className="animate-rise text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-md border-2 border-ink bg-surface shadow-hard-sm">
              <Spinner className="size-6" label="Confirming payment" />
            </span>
            <h1 className="mt-6 text-display-sm font-extrabold">Confirming your payment…</h1>
            <p className="mt-3 text-lg leading-relaxed text-muted-foreground">This usually takes a few seconds. Please keep this page open.</p>
            <div className="mt-8 text-left">
              <ConfirmPoller />
            </div>
          </div>
        )}

        {(state === "failed" || state === "refunded") && (
          <div className="animate-rise">
            <span className="grid size-14 place-items-center rounded-md border-2 border-ink bg-destructive-soft shadow-hard-sm">
              <CircleAlert className="size-6" aria-hidden />
            </span>
            <h1 className="mt-6 text-display-sm font-extrabold">
              {state === "refunded" ? "This payment was refunded." : "The payment didn't go through."}
            </h1>
            <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
              {state === "refunded" ? "If that's unexpected, get in touch and we'll sort it out." : "You haven't been charged. Your answers are saved."}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href={intakeId ? `${routes.checkout}?intake=${intakeId}` : routes.checkout}>Try again</ButtonLink>
              <ButtonLink href={routes.contact} variant="secondary">
                Contact support
              </ButtonLink>
            </div>
          </div>
        )}

        {state === "not_found" && (
          <div className="animate-rise">
            <span className="grid size-14 place-items-center rounded-md border-2 border-ink bg-surface shadow-hard-sm">
              <Hourglass className="size-6" aria-hidden />
            </span>
            <h1 className="mt-6 text-display-sm font-extrabold">We couldn&apos;t find that checkout.</h1>
            <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
              If you paid, it&apos;ll show in Settings → Billing within a few minutes.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href={`${routes.settings}#billing`}>See billing</ButtonLink>
              <ButtonLink href={routes.appHome} variant="secondary">
                Home
              </ButtonLink>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

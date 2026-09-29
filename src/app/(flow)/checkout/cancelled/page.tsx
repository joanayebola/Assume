import type { Metadata } from "next";
import { z } from "zod";

import { FlowHeader } from "@/components/billing/flow-header";
import { ButtonLink } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/session";
import { getBillingStore } from "@/lib/billing";
import { logError } from "@/lib/log";
import { routes } from "@/lib/site";

export const metadata: Metadata = { title: "Checkout cancelled" };

export default async function CheckoutCancelledPage({ searchParams }: PageProps<"/checkout/cancelled">) {
  const { purchase } = await searchParams;
  const viewer = await getViewer();
  let intakeId: string | null = null;
  if (typeof purchase === "string" && z.uuid().safeParse(purchase).success) {
    try {
      intakeId = (await (await getBillingStore()).getPurchase(viewer.user.id, purchase))?.intakeId ?? null;
    } catch (error) {
      logError("checkout:cancelled", error);
    }
  }

  return (
    <>
      <FlowHeader />
      <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-gutter py-12 sm:px-6">
        <div className="animate-rise">
          <h1 className="text-display-md font-extrabold">No problem.</h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-soft">
            Checkout was cancelled and you haven&apos;t been charged. Your answers are saved exactly as you left them.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href={intakeId ? `${routes.checkout}?intake=${intakeId}` : routes.checkout}>Back to checkout</ButtonLink>
            <ButtonLink href={routes.appHome} variant="secondary">
              I&apos;ll come back later
            </ButtonLink>
          </div>
        </div>
      </main>
    </>
  );
}

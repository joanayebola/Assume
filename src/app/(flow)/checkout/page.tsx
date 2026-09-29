import { Check } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";

import { BuildRoutineButton, CheckoutButton } from "@/components/billing/checkout-actions";
import { FlowHeader } from "@/components/billing/flow-header";
import { Notice } from "@/components/ui/notice";
import { routineOffer } from "@/content/billing";
import { getViewer } from "@/lib/auth/session";
import { getBillingStore } from "@/lib/billing";
import { checkoutAvailable, products } from "@/lib/billing/config";
import { formatPrice } from "@/lib/billing/format";
import { checkGenerationEntitlement } from "@/lib/entitlements";
import { getIntakeRepository } from "@/lib/intake";
import { logError } from "@/lib/log";
import { routes } from "@/lib/site";

export const metadata: Metadata = { title: "Your routine" };

export default async function CheckoutPage({ searchParams }: PageProps<"/checkout">) {
  const { intake: rawIntake } = await searchParams;
  const viewer = await getViewer();
  const intakeId = typeof rawIntake === "string" && z.uuid().safeParse(rawIntake).success ? rawIntake : null;

  let desire: string | null = null;
  if (intakeId) {
    const draft = await (await getIntakeRepository()).get(viewer.user.id, intakeId);
    if (!draft) redirect(routes.plans);
    // Already paid for and submitted: nothing to buy.
    if (draft.status === "submitted" && draft.requestId) redirect(`${routes.plans}/generating/${draft.requestId}`);
    desire = draft.desire.desire.trim() || null;
  }

  let entitled = false;
  try {
    const e = await checkGenerationEntitlement(await getBillingStore(), viewer.user.id, "initial", { requestsLast24h: 0 });
    entitled = e.allowed;
  } catch (error) {
    logError("checkout:entitlement", error);
  }

  const product = products().routine;
  const price = formatPrice(product.price);
  const available = checkoutAvailable("routine");
  const back = intakeId ? { href: `${routes.newPlan}/${intakeId}?step=review`, label: "Back to your answers" } : { href: routes.appHome, label: "Home" };

  return (
    <>
      <FlowHeader back={back} />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-gutter py-10 sm:px-6 md:py-16">
        <div className="grid gap-10 md:grid-cols-[1.1fr_0.9fr] md:items-start md:gap-14">
          <section className="animate-rise">
            <p className="inline-block -rotate-1 rounded-sm border-2 border-ink bg-accent px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-widest shadow-hard-xs">
              Your answers are in
            </p>
            <h1 className="mt-5 text-display-lg font-extrabold">One routine, built for your week.</h1>
            {desire && (
              <p className="mt-5 max-w-xl border-l-4 border-accent pl-4 text-lg leading-relaxed text-ink-soft">
                <span className="sr-only">For: </span>“{desire.length > 160 ? `${desire.slice(0, 157)}…` : desire}”
              </p>
            )}
            <ul className="mt-8 space-y-3">
              {routineOffer.includes.map((line) => (
                <li key={line} className="flex items-start gap-3 text-lg leading-snug">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-xs border-2 border-ink bg-surface">
                    <Check className="size-3.5" strokeWidth={3.5} aria-hidden />
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </section>

          <aside className="animate-rise rounded-xl border-2 border-ink bg-surface p-6 shadow-hard-lg [animation-delay:80ms] sm:p-8 md:sticky md:top-8">
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">{routineOffer.name}</p>
            {entitled ? (
              <>
                <p className="mt-3 font-display text-display-sm font-extrabold">You&apos;re all set.</p>
                <p className="mt-2 leading-relaxed text-muted-foreground">You have a routine ready to build — no payment needed.</p>
                <div className="mt-6">
                  {intakeId ? (
                    <BuildRoutineButton intakeId={intakeId} />
                  ) : (
                    <p className="text-sm text-muted-foreground">Start a new plan and it&apos;ll use this automatically.</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 font-display text-display-md font-extrabold tabular-nums">{price ?? "One-time"}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {price ? "One-time purchase. Taxes may apply at checkout." : "Price shown at checkout."}
                </p>
                <div className="mt-6">
                  {available ? (
                    <CheckoutButton intakeId={intakeId} label={price ? `Continue — ${price}` : "Continue to payment"} />
                  ) : (
                    <Notice tone="info" title="Purchases aren't open yet">
                      Your answers are saved. Check back soon — we&apos;ll pick up right where you left off.
                    </Notice>
                  )}
                </div>
                <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{routineOffer.reassurance}</p>
                {viewer.isDemo && available && (
                  <p className="mt-3 rounded-sm bg-accent-soft px-2 py-1 font-mono text-[0.7rem] font-semibold uppercase tracking-wider">
                    Demo mode · checkout is simulated, no payment
                  </p>
                )}
              </>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}

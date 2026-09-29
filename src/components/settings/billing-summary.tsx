import { ArrowRight } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import type { Grant, Purchase } from "@/lib/billing/store";
import { formatPrice } from "@/lib/billing/format";
import { routes } from "@/lib/site";
import { cn } from "@/lib/utils";

const statusLabel: Record<Purchase["status"], string> = {
  pending: "Not completed",
  paid: "Paid",
  failed: "Failed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

function when(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

export function BillingSummary({ purchases, grants, freeMode, now }: { purchases: Purchase[]; grants: Grant[]; freeMode: boolean; now: number }) {
  const available = grants.filter((g) => (g.kind === "routine_credit" || g.kind === "free_credit") && g.status === "available").length;
  const subscription = grants.find((g) => g.kind === "subscription" && g.status === "available" && g.validUntil && Date.parse(g.validUntil) > now);
  // Hide abandoned checkouts — they're noise, not purchases.
  const shown = purchases.filter((p) => p.status !== "pending" && p.status !== "cancelled");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border-2 border-ink bg-background p-4">
        <p>
          <span className="block font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">Routines to build</span>
          <span className="mt-1 block font-display text-2xl font-bold">
            {freeMode ? "Included" : subscription ? "Unlimited" : available}
          </span>
        </p>
        {!freeMode && !subscription && available > 0 && (
          <ButtonLink href={routes.newPlan} size="sm" iconRight={<ArrowRight aria-hidden />}>
            Start a plan
          </ButtonLink>
        )}
      </div>

      {shown.length > 0 ? (
        <ul className="divide-y-2 divide-ink/10 rounded-md border-2 border-ink/15">
          {shown.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span>
                <span className="block font-semibold">{p.productKey === "unlimited" ? "Unlimited" : "Personalised routine"}</span>
                <span className="text-muted-foreground">{when(p.paidAt ?? p.createdAt)}</span>
              </span>
              <span className="text-right">
                <span className="block font-mono tabular-nums">
                  {p.amount !== null && p.currency ? formatPrice({ amount: p.amount, currency: p.currency }) : "—"}
                </span>
                <span className={cn("text-xs font-semibold", p.status === "paid" ? "text-success" : "text-muted-foreground")}>{statusLabel[p.status]}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No purchases yet.</p>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Receipts are emailed by Dodo Payments, our payment provider. For refunds or billing questions, contact support.
      </p>
    </div>
  );
}

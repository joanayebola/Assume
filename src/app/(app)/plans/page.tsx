import { ArrowRight, Layers, Plus, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { IntakeActivity } from "@/components/plans/intake-activity";
import { PlanCardItem } from "@/components/plans/plan-cards";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { listIntakeActivity } from "@/lib/data/intakes";
import { listPlanCards } from "@/lib/data/plans";
import { routes } from "@/lib/site";

export const metadata: Metadata = { title: "My Plans" };

function Group({ id, title, count, children }: { id: string; title: string; count?: number; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <h2 id={id} className="flex items-baseline gap-2 font-display text-2xl font-bold tracking-tight">
        {title}
        {count !== undefined && <span className="font-mono text-sm font-semibold text-muted-foreground">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

export default async function PlansPage() {
  const [{ cards, viewerTimeZone, now, error }, activity] = await Promise.all([listPlanCards(), listIntakeActivity()]);
  const hasActivity = activity.drafts.length > 0 || activity.requests.length > 0;
  const active = cards.filter((c) => c.status === "active" || c.status === "ready" || c.status === "paused");
  // Active before paused, each most-recently-updated first (already sorted).
  active.sort((a, b) => Number(a.status === "paused") - Number(b.status === "paused"));
  const finished = cards.filter((c) => c.status === "completed" || c.status === "archived");
  const manifestedCount = cards.filter((c) => c.status === "completed").length;
  const empty = cards.length === 0 && !hasActivity;

  return (
    <PageBody>
      <PageHeader
        title="My Plans."
        description="Each plan is a routine built for one thing you're manifesting. Keep one, or run a few side by side."
        actions={
          !empty ? (
            <ButtonLink href={routes.newPlan} iconLeft={<Plus aria-hidden />}>
              New plan
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="mt-10 space-y-12">
        {error && <Notice tone="error">{error}</Notice>}

        {empty && (
          <div className="flex flex-col items-start gap-6 rounded-xl border-2 border-dashed border-ink bg-background p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
            <div className="flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-md border-2 border-ink bg-surface shadow-hard-xs">
                <Layers className="size-6" aria-hidden />
              </span>
              <div>
                <h2 className="text-display-sm font-bold">No plans yet.</h2>
                <p className="mt-1 text-muted-foreground">Your first routine will show up here once it&apos;s built.</p>
              </div>
            </div>
            <ButtonLink href={routes.newPlan} iconRight={<ArrowRight aria-hidden />}>
              Create my first plan
            </ButtonLink>
          </div>
        )}

        {active.length > 0 && (
          <Group id="active-plans" title="Active" count={active.length}>
            <ul className="grid gap-4 sm:grid-cols-2">
              {active.map((c) => (
                <PlanCardItem key={c.id} card={c} viewerTimeZone={viewerTimeZone} now={now} />
              ))}
            </ul>
          </Group>
        )}

        {hasActivity && (
          <Group id="draft-plans" title="In progress">
            <IntakeActivity drafts={activity.drafts} requests={activity.requests} />
          </Group>
        )}

        {finished.length > 0 && (
          <Group id="finished-plans" title="Finished" count={finished.length}>
            <ul className="grid gap-4 sm:grid-cols-2">
              {finished.map((c) => (
                <PlanCardItem key={c.id} card={c} viewerTimeZone={viewerTimeZone} now={now} />
              ))}
            </ul>
          </Group>
        )}

        {!empty && (
          <Link
            href={routes.manifested}
            className="group flex items-center justify-between gap-4 rounded-lg border-2 border-ink bg-accent p-5 shadow-hard-sm transition-[transform,box-shadow] duration-100 hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-md active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
          >
            <span className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-md border-2 border-ink bg-surface">
                <Sparkles className="size-5" aria-hidden />
              </span>
              <span>
                <span className="block font-display text-xl font-bold">Manifested archive</span>
                <span className="block text-sm">
                  {manifestedCount ? `${manifestedCount} marked as manifested` : "Where finished manifestations live"}
                </span>
              </span>
            </span>
            <ArrowRight className="size-5 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        )}
      </div>
    </PageBody>
  );
}

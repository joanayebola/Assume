import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { DraftCard } from "@/components/plans/intake-activity";
import { StartPlanButton } from "@/components/plans/start-plan-button";
import { intakeOverview } from "@/content/intake";
import { listIntakeActivity } from "@/lib/data/intakes";

export const metadata: Metadata = { title: "New Plan" };

export default async function NewPlanPage() {
  const { drafts } = await listIntakeActivity();

  return (
    <PageBody>
      <PageHeader
        title="Here's what we'll ask."
        description="Six short steps, in your own words. There are no wrong answers, and you can save and finish later."
      />

      {drafts.length > 0 && (
        <section aria-labelledby="resume-title" className="mt-10">
          <h2 id="resume-title" className="mb-3 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pick up where you left off
          </h2>
          <ul className="space-y-3">
            {drafts.map((d) => (
              <DraftCard key={d.id} draft={d} />
            ))}
          </ul>
        </section>
      )}

      <ol className="mt-12 border-t-2 border-ink">
        {intakeOverview.map((section, i) => (
          <li key={section.key} className="grid gap-2 border-b-2 border-ink py-5 sm:grid-cols-[16rem_1fr] sm:gap-8">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-semibold text-muted-foreground">0{i + 1}</span>
              <h2 className="text-xl font-bold tracking-tight">{section.title}</h2>
            </div>
            <p className="leading-relaxed text-muted-foreground">{section.summary}</p>
          </li>
        ))}
      </ol>

      <div className="on-ink mt-8 flex flex-col gap-5 rounded-xl border-2 border-ink bg-ink p-6 text-surface sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <p className="font-display text-2xl font-bold tracking-tight">About five minutes.</p>
          <p className="mt-2 text-surface/75">Everything saves as you go.</p>
        </div>
        <StartPlanButton size="lg" className="shrink-0">
          {drafts.length > 0 ? "Start a new plan" : "Start my plan"}
        </StartPlanButton>
      </div>
    </PageBody>
  );
}

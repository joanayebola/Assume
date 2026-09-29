import { ArrowRight, Plus, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageBody } from "@/components/app-shell/page-header";
import { EmptyRoutine } from "@/components/plans/empty-routine";
import { IntakeActivity } from "@/components/plans/intake-activity";
import { TimezoneCheck } from "@/components/today/timezone-check";
import { TodayList } from "@/components/today/today-list";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { getViewer } from "@/lib/auth/session";
import { longDate } from "@/lib/calendar/format";
import { zoneAbbreviation } from "@/lib/calendar/zoned";
import { listIntakeActivity } from "@/lib/data/intakes";
import { listPlanRecords } from "@/lib/data/plans";
import { loadToday } from "@/lib/data/today";
import { routes } from "@/lib/site";

export const metadata: Metadata = { title: "Today" };

/**
 * Home reflects where someone actually is — never a generic dashboard:
 * first visit · answers in progress · routine being built · active routines
 * (one or several) · everything paused · things already manifested.
 */
export default async function HomePage() {
  const [{ displayName, hasProfileRow, profile }, { plans }, { agenda, error }, activity] = await Promise.all([
    getViewer(),
    listPlanRecords(),
    loadToday(),
    listIntakeActivity(),
  ]);
  const firstName = displayName.split(" ")[0];
  const building = activity.requests.filter((r) => r.status === "queued" || r.status === "processing" || r.status === "failed");
  const hasActivity = activity.drafts.length > 0 || activity.requests.length > 0;
  const active = plans.filter((p) => p.status === "active" || p.status === "ready");
  const paused = plans.filter((p) => p.status === "paused");
  const manifested = plans.filter((p) => p.status === "completed").length;
  const firstVisit = plans.length === 0 && !hasActivity;
  const waitingOnly = active.length === 0 && (building.length > 0 || activity.drafts.length > 0);

  const errors = (
    <>
      {!hasProfileRow && (
        <Notice tone="error" title="Your profile hasn't been set up">
          The database migrations may not have been applied yet. See the README for setup steps.
        </Notice>
      )}
      {error && hasProfileRow && <Notice tone="error">{error}</Notice>}
    </>
  );

  // ---- First visit: one clear thing to do ---------------------------------
  if (firstVisit) {
    return (
      <PageBody>
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">Welcome, {firstName}</p>
        <div className="mt-6 space-y-6">
          {errors}
          <EmptyRoutine />
        </div>
      </PageBody>
    );
  }

  // ---- Nothing running yet: pick up where they left off --------------------
  if (waitingOnly) {
    return (
      <PageBody>
        <header>
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">Welcome back, {firstName}</p>
          <h1 className="mt-3 text-display-md font-extrabold">{building.length ? "Your routine is on its way." : "Pick up where you left off."}</h1>
          <p className="mt-3 max-w-xl text-lg leading-relaxed text-muted-foreground">
            {building.length
              ? "It usually takes about a minute. You can leave and come back — we'll keep going."
              : "Your answers are saved exactly as you left them."}
          </p>
        </header>
        <div className="mt-8 space-y-6">
          {errors}
          <IntakeActivity drafts={activity.drafts} requests={activity.requests} />
          {(paused.length > 0 || manifested > 0) && <Footnotes paused={paused.length} manifested={manifested} />}
        </div>
      </PageBody>
    );
  }

  // ---- Today --------------------------------------------------------------
  return (
    <PageBody>
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hi, {firstName}</p>
          <h1 className="mt-3 text-display-md font-extrabold">Today</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            {longDate(agenda.date)}
            <span className="font-mono text-sm"> · {zoneAbbreviation(agenda.timeZone)}</span>
          </p>
        </div>
        <ButtonLink href={routes.newPlan} variant="secondary" iconLeft={<Plus aria-hidden />} className="self-start sm:self-auto">
          New plan
        </ButtonLink>
      </header>

      <div className="mt-8 space-y-6">
        {errors}
        <TimezoneCheck profileTimeZone={profile.timezone} />
        {building.length > 0 && <IntakeActivity drafts={[]} requests={building} />}

        {agenda.items.length > 0 ? (
          <TodayList items={agenda.items} date={agenda.date} timeZone={agenda.timeZone} showPlanNames={agenda.activePlans > 1} />
        ) : (
          <section className="rounded-xl border-2 border-dashed border-ink bg-background px-6 py-12 text-center sm:py-16">
            <p className="font-display text-display-sm font-extrabold">Nothing scheduled today.</p>
            <p className="mt-2 text-xl text-ink-soft">Live your life.</p>
            {active.length === 0 && (
              <p className="mt-6 text-sm text-muted-foreground">
                None of your routines are running right now.{" "}
                <Link href={routes.plans} className="font-semibold text-ink underline decoration-2 underline-offset-4">
                  My Plans
                </Link>
              </p>
            )}
          </section>
        )}

        {activity.drafts.length > 0 && (
          <section aria-labelledby="activity-title" className="space-y-3 pt-4">
            <h2 id="activity-title" className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              In progress
            </h2>
            <IntakeActivity drafts={activity.drafts} requests={[]} />
          </section>
        )}

        <Footnotes paused={paused.length} manifested={manifested} running={active.length} />
      </div>
    </PageBody>
  );
}

/** A quiet line of context: how many routines are running / paused / manifested. */
function Footnotes({ running, paused, manifested }: { running?: number; paused: number; manifested: number }) {
  const parts = [
    running !== undefined && running > 1 ? `${running} routines running` : null,
    paused ? `${paused} paused` : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
      <Link href={routes.plans} className="inline-flex min-h-11 items-center gap-1.5 rounded-sm font-semibold underline decoration-2 underline-offset-4">
        All my plans{parts.length ? <span className="font-normal text-muted-foreground no-underline"> · {parts.join(" · ")}</span> : null}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
      {manifested > 0 && (
        <Link
          href={routes.manifested}
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-md border-2 border-ink bg-accent px-3 text-sm font-semibold shadow-hard-xs"
        >
          <Sparkles className="size-4" aria-hidden />
          {manifested} manifested
        </Link>
      )}
    </div>
  );
}

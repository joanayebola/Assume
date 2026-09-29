import { ArrowLeft, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageBody } from "@/components/app-shell/page-header";
import { ArchiveEntryCard } from "@/components/plans/archive-entry";
import { Notice } from "@/components/ui/notice";
import { requireUser } from "@/lib/auth/session";
import { getPlanStore } from "@/lib/plan";
import type { ManifestedEntry } from "@/lib/plan/store";
import { routes } from "@/lib/site";
import { logError } from "@/lib/log";

export const metadata: Metadata = { title: "Manifested" };

async function loadEntries(): Promise<{ entries: ManifestedEntry[]; error: string | null }> {
  const user = await requireUser();
  try {
    return { entries: await (await getPlanStore()).listManifested(user.id), error: null };
  } catch (error) {
    logError("manifested", error);
    return { entries: [], error: "We couldn't load your archive right now." };
  }
}

export default async function ManifestedPage() {
  const { entries, error } = await loadEntries();
  const years = [...new Set(entries.map((e) => e.manifestedOn.slice(0, 4)))];

  return (
    <PageBody>
      <Link href={routes.plans} className="inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-semibold text-muted-foreground hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> My Plans
      </Link>

      <header className="mt-4">
        <p className="inline-block -rotate-2 rounded-sm border-2 border-ink bg-accent px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-widest shadow-hard-xs">
          Archive
        </p>
        <h1 className="mt-4 text-display-lg font-extrabold">Manifested.</h1>
        <p className="mt-3 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Things you set out for, and marked as here. However they arrived.
        </p>
      </header>

      <div className="mt-12">
        {error && <Notice tone="error">{error}</Notice>}

        {entries.length === 0 && !error ? (
          <div className="rounded-xl border-2 border-dashed border-ink px-6 py-14 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-md border-2 border-ink bg-surface shadow-hard-xs">
              <Sparkles className="size-6" aria-hidden />
            </span>
            <p className="mt-5 font-display text-display-sm font-extrabold">Nothing here yet.</p>
            <p className="mx-auto mt-2 max-w-md text-muted-foreground">
              When something you&apos;re manifesting arrives, open its plan and choose “Mark as manifested”. It&apos;ll live here.
            </p>
          </div>
        ) : (
          <div className="space-y-12">
            {years.map((year) => (
              <section key={year} aria-labelledby={`y-${year}`}>
                <h2 id={`y-${year}`} className="mb-5 border-b-2 border-ink pb-2 font-mono text-sm font-bold tracking-wider">
                  {year}
                </h2>
                <ul className="grid gap-5 sm:grid-cols-2">
                  {entries
                    .filter((e) => e.manifestedOn.startsWith(year))
                    .map((e, i) => (
                      <ArchiveEntryCard key={e.id} entry={e} tilt={i % 3 === 0 ? "left" : i % 3 === 1 ? "none" : "right"} />
                    ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </PageBody>
  );
}

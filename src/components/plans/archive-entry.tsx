"use client";

import { ArrowRight, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { removeFromManifestedArchive } from "@/lib/actions/lifecycle";
import { longDate } from "@/lib/calendar/format";
import type { ManifestedEntry } from "@/lib/plan/store";
import { routes } from "@/lib/site";
import { cn } from "@/lib/utils";

/** One manifested thing — a slightly tilted card, like a pinned note. */
export function ArchiveEntryCard({ entry, tilt }: { entry: ManifestedEntry; tilt: "left" | "right" | "none" }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    const r = await removeFromManifestedArchive(entry.id).catch(() => ({ ok: false as const, message: "We couldn't reach the server." }));
    setBusy(false);
    if (!r.ok) return setError(r.message);
    router.refresh();
  };

  return (
    <li
      className={cn(
        "flex flex-col rounded-lg border-2 border-ink bg-surface p-5 shadow-hard-md transition-transform duration-200 hover:rotate-0 sm:p-6",
        tilt === "left" && "sm:-rotate-1",
        tilt === "right" && "sm:rotate-1",
      )}
    >
      <p className="font-mono text-xs font-semibold uppercase tracking-wider text-accent-ink">{longDate(entry.manifestedOn)}</p>
      <p className="mt-3 font-display text-2xl font-bold leading-tight tracking-tight">{entry.desire}</p>
      {entry.note && <p className="mt-3 whitespace-pre-line leading-relaxed text-ink-soft">{entry.note}</p>}

      <div className="mt-auto flex items-center justify-between gap-2 pt-5">
        {entry.planId ? (
          <Link href={`${routes.plans}/${entry.planId}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold underline decoration-2 underline-offset-4">
            The routine <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">{entry.title}</span>
        )}
        {confirming ? (
          <span className="flex items-center gap-1 animate-pop">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} autoFocus>
              Keep
            </Button>
            <Button size="sm" variant="destructive" loading={busy} onClick={remove}>
              Remove
            </Button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Remove “${entry.desire}” from the archive`}
            className="grid size-11 place-items-center rounded-md border-2 border-transparent text-muted-foreground hover:border-ink hover:bg-destructive-soft hover:text-ink"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-sm font-medium text-destructive">{error}</p>}
    </li>
  );
}

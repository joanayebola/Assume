"use client";

import { CalendarCheck2, CalendarX2, FileDown, RefreshCw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, buttonClasses } from "@/components/ui/button";
import { readStorage, useClientValue, writeStorage } from "@/hooks/use-client-value";
import { removeFromGoogleCalendar, updateGoogleCalendar } from "@/lib/actions/calendar";
import { dayMonth } from "@/lib/calendar/format";
import { routes } from "@/lib/site";

import type { CalendarContext } from "./types";

const dismissKey = (planId: string, at: string) => `assume:ics-dismissed:${planId}:${at}`;

/**
 * What's in the person's calendar for this plan, and what to do when the
 * routine has changed since. Only shown once something has been exported.
 */
export function PlanCalendarPanel({
  ctx,
  paused,
  onOpenExport,
  notify,
}: {
  ctx: CalendarContext;
  paused: boolean;
  onOpenExport: (provider: "ics" | "google") => void;
  notify: (tone: "success" | "error", message: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"update" | "remove" | null>(null);
  const { google, ics } = ctx.exports;
  const [dismissedNow, setDismissedNow] = useState(false);
  const storedDismissal = useClientValue(() => (ics ? readStorage(dismissKey(ctx.planId, ics.lastExportedAt)) === "1" : false), false);
  const icsDismissed = dismissedNow || storedDismissal;

  const update = async () => {
    setBusy("update");
    try {
      const r = await updateGoogleCalendar(ctx.planId);
      if (!r.ok) return notify("error", r.message);
      const { created, updated, removed } = r.result;
      const changed = created + updated + removed;
      notify("success", changed ? "Google Calendar is up to date." : "Nothing needed changing.");
      router.refresh();
    } catch {
      notify("error", "We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("remove");
    try {
      const r = await removeFromGoogleCalendar(ctx.planId);
      if (!r.ok) return notify("error", r.message);
      notify("success", "Removed from Google Calendar.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const dismissIcs = () => {
    setDismissedNow(true);
    if (ics) writeStorage(dismissKey(ctx.planId, ics.lastExportedAt), "1");
  };

  const connectHref = `${routes.googleConnect}?next=${encodeURIComponent(`${routes.plans}/${ctx.planId}?export=google`)}`;
  const blocks: React.ReactNode[] = [];

  if (google) {
    if (google.state === "needs_reconnect" || ctx.google.needsReconnect || !ctx.google.connected) {
      blocks.push(
        <div key="g" className="flex flex-col gap-3 rounded-lg border-2 border-ink bg-destructive-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Google Calendar needs reconnecting</p>
            <p className="mt-0.5 text-sm">Access was removed or expired. Your events are still there; we just can&apos;t update them.</p>
          </div>
          <a href={connectHref} className={buttonClasses({ size: "sm" })}>
            Reconnect
          </a>
        </div>,
      );
    } else if (google.state === "out_of_date" && !paused) {
      blocks.push(
        <div key="g" className="rounded-lg border-2 border-ink bg-accent-soft p-4 shadow-hard-sm animate-pop">
          <p className="font-display text-xl font-bold">Your routine changed. Update calendar?</p>
          <p className="mt-1 text-sm leading-relaxed">
            Your Google Calendar still has the old version. Updating changes those events in place — nothing is duplicated.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button size="sm" loading={busy === "update"} loadingText="Updating…" iconLeft={<RefreshCw aria-hidden />} onClick={update}>
              Update calendar
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onOpenExport("google")}>
              Review changes first
            </Button>
          </div>
        </div>,
      );
    } else {
      blocks.push(
        <div key="g" className="flex flex-wrap items-center justify-between gap-2 rounded-md border-2 border-ink/15 bg-surface px-4 py-3">
          <p className="flex items-center gap-2 text-sm">
            <CalendarCheck2 className="size-4 shrink-0" aria-hidden />
            <span>
              <span className="font-semibold">In Google Calendar</span> · {google.eventCount} {google.eventCount === 1 ? "event" : "events"} · updated{" "}
              {dayMonth(google.lastExportedAt, ctx.viewerTimeZone)}
              {paused && " · this routine is paused"}
            </span>
          </p>
          <span className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => onOpenExport("google")}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" loading={busy === "remove"} iconLeft={<CalendarX2 aria-hidden />} onClick={remove}>
              Remove
            </Button>
          </span>
        </div>,
      );
    }
  }

  if (ics && ics.state === "out_of_date" && !icsDismissed && !paused) {
    blocks.push(
      <div key="i" className="relative rounded-lg border-2 border-ink bg-surface p-4 pr-12 shadow-hard-xs animate-pop">
        <button type="button" onClick={dismissIcs} aria-label="Dismiss" className="absolute right-2 top-2 grid size-10 place-items-center rounded-md hover:bg-ink/5">
          <X className="size-4" aria-hidden />
        </button>
        <p className="font-semibold">Your routine changed since you added it to your calendar</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Events imported from a calendar file can&apos;t be updated automatically. To switch over, delete the events you imported on{" "}
          {dayMonth(ics.lastExportedAt, ctx.viewerTimeZone)}, then add the new file.
        </p>
        <Button size="sm" variant="secondary" className="mt-3" iconLeft={<FileDown aria-hidden />} onClick={() => onOpenExport("ics")}>
          Get the updated file
        </Button>
      </div>,
    );
  }

  if (!blocks.length) return null;
  return <div className="space-y-3">{blocks}</div>;
}

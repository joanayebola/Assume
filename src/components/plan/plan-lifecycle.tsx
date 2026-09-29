"use client";

import { Archive, ArchiveRestore, BookHeart, Copy, MoreHorizontal, Pause, Play, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AutoTextarea } from "@/components/intake/controls";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { controlClasses } from "@/components/ui/field";
import { Menu } from "@/components/ui/menu";
import { Notice } from "@/components/ui/notice";
import {
  archivePlan,
  completePlan,
  deletePlan,
  duplicatePlan,
  pausePlan,
  restorePlan,
  resumePlan,
  saveToManifestedArchive,
  type LifecycleResult,
} from "@/lib/actions/lifecycle";
import { dayMonth } from "@/lib/calendar/format";
import type { PlanStatus } from "@/lib/plan/store";
import { routes } from "@/lib/site";
import { cn } from "@/lib/utils";

type Confirm = "pause" | "archive" | "delete" | "complete" | null;

export type LifecycleProps = {
  planId: string;
  title: string;
  /** What's being manifested, in the person's words. */
  desire: string;
  status: PlanStatus;
  pausedAt: string | null;
  completedAt: string | null;
  inGoogle: boolean;
  hasIcsExport: boolean;
  viewerTimeZone: string;
  planToday: string;
  notify: (tone: "success" | "error", message: string) => void;
};

function CalendarChoice({ inGoogle, hasIcsExport, checked, onChange, verb }: { inGoogle: boolean; hasIcsExport: boolean; checked: boolean; onChange: (v: boolean) => void; verb: string }) {
  if (!inGoogle && !hasIcsExport) return null;
  return (
    <div className="mt-5 space-y-3">
      {inGoogle && (
        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border-2 border-ink bg-surface px-3 py-2.5">
          <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-[var(--ink)]" />
          <span className="text-sm font-semibold">Also remove its events from Google Calendar</span>
        </label>
      )}
      {hasIcsExport && (
        <p className="text-sm text-muted-foreground">
          Events you imported from a calendar file stay in your calendar app — {verb === "delete" ? "delete" : "remove"} them there if you like.
        </p>
      )}
    </div>
  );
}

/** Lifecycle menu + banner + confirmations for one plan. */
export function PlanLifecycle(p: LifecycleProps) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [removeEvents, setRemoveEvents] = useState(true);
  const [busy, setBusy] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  const open = (c: Confirm) => {
    setRemoveEvents(true);
    setConfirm(c);
  };

  async function run(action: () => Promise<LifecycleResult>, success: string, after?: () => void) {
    setBusy(true);
    try {
      const r = await action();
      if (!r.ok) return p.notify("error", r.message);
      setConfirm(null);
      p.notify(r.warning ? "error" : "success", r.warning ?? success);
      after?.();
      router.refresh();
    } catch {
      p.notify("error", "We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const duplicate = async () => {
    setBusy(true);
    try {
      const r = await duplicatePlan(p.planId);
      if (!r.ok) return p.notify("error", r.message);
      router.push(`${routes.plans}/${r.planId}`);
      p.notify("success", "Copied. You're looking at the copy.");
    } finally {
      setBusy(false);
    }
  };

  const live = p.status === "active" || p.status === "ready";

  return (
    <>
      <Menu
        label="Routine options"
        disabled={busy}
        triggerClassName="grid size-11 place-items-center rounded-md border-2 border-ink bg-surface shadow-hard-xs hover:bg-background disabled:opacity-50"
        trigger={<MoreHorizontal className="size-5" aria-hidden />}
        items={[
          { label: "Pause routine", icon: Pause, onSelect: () => open("pause"), hidden: !live },
          { label: "Resume routine", icon: Play, onSelect: () => run(() => resumePlan(p.planId), "Welcome back. It's on Today again."), hidden: p.status !== "paused" },
          { label: "Mark as manifested", icon: Sparkles, onSelect: () => open("complete"), hidden: p.status === "completed" },
          { label: "Save to manifested archive", icon: BookHeart, onSelect: () => setCelebrate(true), hidden: p.status !== "completed" },
          { label: "Duplicate", icon: Copy, onSelect: duplicate },
          { label: "Archive", icon: Archive, onSelect: () => open("archive"), hidden: p.status === "archived" },
          { label: "Restore", icon: ArchiveRestore, onSelect: () => run(() => restorePlan(p.planId), "Restored. It's active again."), hidden: p.status !== "archived" && p.status !== "completed" },
          { label: "Delete", icon: Trash2, onSelect: () => open("delete"), danger: true },
        ]}
      />

      {/* Pause ------------------------------------------------------------- */}
      <Dialog
        open={confirm === "pause"}
        onClose={() => setConfirm(null)}
        title="Pause this routine?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Keep going
            </Button>
            <Button loading={busy} loadingText="Pausing…" iconLeft={<Pause aria-hidden />} onClick={() => run(() => pausePlan(p.planId, p.inGoogle && removeEvents), "Paused. Resume whenever you like.")}>
              Pause
            </Button>
          </>
        }
      >
        <p className="leading-relaxed">It&apos;ll step off Today until you resume. Nothing is deleted, and you can pick it up exactly where it is.</p>
        <CalendarChoice inGoogle={p.inGoogle} hasIcsExport={p.hasIcsExport} checked={removeEvents} onChange={setRemoveEvents} verb="remove" />
      </Dialog>

      {/* Archive ------------------------------------------------------------ */}
      <Dialog
        open={confirm === "archive"}
        onClose={() => setConfirm(null)}
        title="Archive this routine?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="ink" loading={busy} loadingText="Archiving…" iconLeft={<Archive aria-hidden />} onClick={() => run(() => archivePlan(p.planId, p.inGoogle && removeEvents), "Archived. Find it under Finished in My Plans.")}>
              Archive
            </Button>
          </>
        }
      >
        <p className="leading-relaxed">It moves to Finished in My Plans. You can restore it any time.</p>
        <CalendarChoice inGoogle={p.inGoogle} hasIcsExport={p.hasIcsExport} checked={removeEvents} onChange={setRemoveEvents} verb="remove" />
      </Dialog>

      {/* Delete -------------------------------------------------------------- */}
      <Dialog
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        title="Delete this routine?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} autoFocus>
              Keep it
            </Button>
            <Button
              variant="destructive"
              loading={busy}
              loadingText="Deleting…"
              iconLeft={<Trash2 aria-hidden />}
              onClick={() => run(() => deletePlan(p.planId, p.inGoogle && removeEvents), "Deleted.", () => router.push(routes.plans))}
            >
              Delete for good
            </Button>
          </>
        }
      >
        <p className="leading-relaxed">
          “{p.title}” and its version history will be gone. This can&apos;t be undone. If you might want it later, archive it instead.
        </p>
        <CalendarChoice inGoogle={p.inGoogle} hasIcsExport={p.hasIcsExport} checked={removeEvents} onChange={setRemoveEvents} verb="delete" />
      </Dialog>

      {/* Complete ------------------------------------------------------------ */}
      <Dialog
        open={confirm === "complete"}
        onClose={() => setConfirm(null)}
        title="Mark as manifested?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Not yet
            </Button>
            <Button
              loading={busy}
              loadingText="Saving…"
              iconLeft={<Sparkles aria-hidden />}
              onClick={() => run(() => completePlan(p.planId, p.inGoogle && removeEvents), "Marked as manifested.", () => setCelebrate(true))}
            >
              Yes, it&apos;s here
            </Button>
          </>
        }
      >
        <p className="leading-relaxed">The routine finishes and steps off Today. You can always restore it.</p>
        <CalendarChoice inGoogle={p.inGoogle} hasIcsExport={p.hasIcsExport} checked={removeEvents} onChange={setRemoveEvents} verb="remove" />
      </Dialog>

      {celebrate && <Celebration planId={p.planId} desire={p.desire || p.title} planToday={p.planToday} onClose={() => setCelebrate(false)} />}
    </>
  );
}

/** The moment after marking complete — then an optional archive entry. */
export function Celebration({ planId, desire, planToday, onClose }: { planId: string; desire: string; planToday: string; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [date, setDate] = useState(planToday);
  const [state, setState] = useState<"ask" | "saving" | "saved">("ask");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setState("saving");
    setError(null);
    try {
      const r = await saveToManifestedArchive(planId, { note, manifestedOn: date });
      if (!r.ok) {
        setError(r.message);
        setState("ask");
        return;
      }
      setState("saved");
    } catch {
      setError("We couldn't reach the server. Try again.");
      setState("ask");
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Congratulations."
      footer={
        state === "saved" ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <ButtonLink href={routes.manifested}>See your archive</ButtonLink>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Not now
            </Button>
            <Button loading={state === "saving"} loadingText="Saving…" onClick={save}>
              Save to my archive
            </Button>
          </>
        )
      }
    >
      <div className="relative overflow-hidden rounded-lg border-2 border-ink bg-accent p-6 text-center shadow-hard-md sm:p-8">
        <Burst />
        <p className="relative inline-block -rotate-2 rounded-sm border-2 border-ink bg-surface px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-widest shadow-hard-xs animate-pop">
          Manifested
        </p>
        <p className="relative mt-4 font-display text-display-sm font-extrabold animate-rise">It&apos;s here.</p>
        <p className="relative mx-auto mt-2 max-w-sm leading-relaxed animate-rise [animation-delay:120ms]">
          However it arrived, it&apos;s yours. Take a moment with it.
        </p>
      </div>

      {state === "saved" ? (
        <p className="mt-6 text-center font-semibold animate-rise">Saved to your manifested archive.</p>
      ) : (
        <div className="mt-6 space-y-4 animate-rise [animation-delay:200ms]">
          <p className="font-display text-xl font-bold">Want to save this in your manifested archive?</p>
          <p className="-mt-2 text-sm text-muted-foreground">“{desire}” — somewhere to look back on.</p>
          <label className="block space-y-2">
            <span className="text-sm font-semibold">
              What happened? <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <AutoTextarea value={note} onChange={(e) => setNote(e.target.value)} minRows={2} maxLength={1000} placeholder="In your own words" />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-semibold">When</span>
            <input type="date" value={date} max={planToday} onChange={(e) => e.target.value && setDate(e.target.value)} className={cn(controlClasses, "h-12")} />
          </label>
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      )}
    </Dialog>
  );
}

/** A few hard-edged sparks — celebratory without confetti chaos. */
function Burst() {
  const sparks = [
    [8, 18, -12],
    [86, 14, 18],
    [14, 78, 24],
    [90, 72, -20],
    [50, 6, 0],
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {sparks.map(([x, y, r], i) => (
        <span
          key={i}
          className="absolute size-3 border-2 border-ink bg-surface animate-pop"
          style={{ left: `${x}%`, top: `${y}%`, transform: `rotate(${45 + r}deg)`, animationDelay: `${120 + i * 60}ms` }}
        />
      ))}
    </div>
  );
}

/** Status banner for paused / completed / archived plans. */
export function LifecycleBanner({
  planId,
  status,
  pausedAt,
  completedAt,
  viewerTimeZone,
  notify,
}: Pick<LifecycleProps, "planId" | "status" | "pausedAt" | "completedAt" | "viewerTimeZone" | "notify">) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<LifecycleResult>, msg: string) => {
    setBusy(true);
    try {
      const r = await fn();
      if (!r.ok) return notify("error", r.message);
      notify("success", msg);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (status === "paused") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border-2 border-ink bg-surface p-4 shadow-hard-xs sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 font-semibold">
          <Pause className="size-4" aria-hidden />
          Paused{pausedAt ? ` since ${dayMonth(pausedAt, viewerTimeZone)}` : ""}. It&apos;s not on Today.
        </p>
        <Button size="sm" loading={busy} iconLeft={<Play aria-hidden />} onClick={() => act(() => resumePlan(planId), "Welcome back. It's on Today again.")}>
          Resume
        </Button>
      </div>
    );
  }
  if (status === "completed") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border-2 border-ink bg-accent-soft p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4" aria-hidden />
          Manifested{completedAt ? ` · ${dayMonth(completedAt, viewerTimeZone)}` : ""}
        </p>
        <Link href={routes.manifested} className="text-sm font-semibold underline decoration-2 underline-offset-4">
          Manifested archive
        </Link>
      </div>
    );
  }
  if (status === "archived") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border-2 border-dashed border-ink bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 font-semibold">
          <Archive className="size-4" aria-hidden />
          Archived. It&apos;s not on Today.
        </p>
        <Button size="sm" variant="secondary" loading={busy} iconLeft={<ArchiveRestore aria-hidden />} onClick={() => act(() => restorePlan(planId), "Restored. It's active again.")}>
          Restore
        </Button>
      </div>
    );
  }
  return null;
}

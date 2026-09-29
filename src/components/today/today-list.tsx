"use client";

import { ArrowRight, Check, ChevronDown, Clock, MoreHorizontal, SkipForward, Undo2 } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { controlClasses } from "@/components/ui/field";
import { Menu } from "@/components/ui/menu";
import { useMinute } from "@/hooks/use-client-value";
import { updateOccurrence } from "@/lib/actions/today";
import { clockAt } from "@/lib/calendar/format";
import { zonedToUtc } from "@/lib/calendar/zoned";
import { formatClock } from "@/lib/intake/format";
import { fromMinutes, toMinutes } from "@/lib/plan/time";
import { routes } from "@/lib/site";
import type { AgendaItem } from "@/lib/today/agenda";
import type { CheckinStatus } from "@/lib/today/store";
import { cn } from "@/lib/utils";

type Local = { status: CheckinStatus | null; movedTo: number | null };

/**
 * Today's sessions with Done / Skip / Move today. Updates are optimistic and
 * roll back on failure. Deliberately no counts, streaks or "missed" states.
 */
export function TodayList({
  items: initial,
  date,
  timeZone,
  showPlanNames,
}: {
  items: AgendaItem[];
  date: string;
  timeZone: string;
  showPlanNames: boolean;
}) {
  const now = useMinute();
  const [local, setLocal] = useState<Record<string, Local>>({});
  const [moving, setMoving] = useState<AgendaItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const state = (i: AgendaItem): Local => local[i.key] ?? { status: i.status, movedTo: i.moved ? i.start : null };

  async function apply(item: AgendaItem, next: Local) {
    const before = state(item);
    setLocal((l) => ({ ...l, [item.key]: next }));
    setError(null);
    try {
      const r = await updateOccurrence({
        planId: item.planId,
        sessionId: item.sessionId,
        date: item.occurrenceDate,
        status: next.status,
        movedTo: next.movedTo === null ? null : new Date(next.movedTo).toISOString(),
      });
      if (!r.ok) throw new Error(r.message);
    } catch (e) {
      setLocal((l) => ({ ...l, [item.key]: before }));
      setError(e instanceof Error && e.message ? e.message : "That didn't save. Try again.");
    }
  }

  const view = initial
    .map((i) => {
      const s = state(i);
      return { item: i, s, start: s.movedTo ?? i.originalStart };
    })
    .sort((a, b) => a.start - b.start);

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 rounded-md border-2 border-ink bg-destructive-soft px-4 py-3 text-sm font-medium">
          {error}
        </p>
      )}
      <ol className="space-y-3">
        {view.map(({ item, s, start }) => (
          <Row
            key={item.key}
            item={item}
            state={s}
            time={clockAt(start, timeZone)}
            isNow={now !== null && s.status === null && now >= start && now < start + item.durationMinutes * 60_000}
            showPlanName={showPlanNames}
            onDone={() => apply(item, { ...s, status: s.status === "done" ? null : "done" })}
            onSkip={() => apply(item, { ...s, status: "skipped" })}
            onUndo={() => apply(item, { ...s, status: null })}
            onMove={() => setMoving(item)}
          />
        ))}
      </ol>

      {moving && (
        <MoveDialog
          item={moving}
          current={state(moving).movedTo}
          date={date}
          timeZone={timeZone}
          onClose={() => setMoving(null)}
          onSave={(movedTo) => {
            setMoving(null);
            void apply(moving, { ...state(moving), movedTo });
          }}
        />
      )}
    </div>
  );
}

function Row({
  item,
  state,
  time,
  isNow,
  showPlanName,
  onDone,
  onSkip,
  onUndo,
  onMove,
}: {
  item: AgendaItem;
  state: Local;
  time: string;
  isNow: boolean;
  showPlanName: boolean;
  onDone: () => void;
  onSkip: () => void;
  onUndo: () => void;
  onMove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const done = state.status === "done";
  const skipped = state.status === "skipped";
  const moved = state.movedTo !== null;

  return (
    <li
      className={cn(
        "rounded-lg border-2 border-ink bg-surface transition-[box-shadow,opacity] duration-150",
        isNow ? "shadow-hard-md" : "shadow-hard-xs",
        skipped && "border-dashed bg-background shadow-none",
        item.optional && !done && !skipped && "border-dashed",
      )}
    >
      <div className="flex items-start gap-3 p-4 sm:gap-5 sm:p-5">
        <div className="w-[4.5rem] shrink-0 pt-0.5 sm:w-20">
          <p className={cn("font-mono text-base font-bold tabular-nums", skipped && "text-muted-foreground")}>{time}</p>
          {moved && <p className="mt-0.5 font-mono text-[0.7rem] text-muted-foreground line-through">{formatClock(item.originalTime)}</p>}
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{item.durationMinutes} min</p>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {isNow && <span className="rounded-xs border-2 border-ink bg-accent px-1.5 font-mono text-[0.68rem] font-bold uppercase tracking-wider">Now</span>}
            {item.technique.toLowerCase() !== item.title.toLowerCase() && (
              <span className="font-mono text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">{item.technique}</span>
            )}
            {item.optional && <span className="text-xs text-muted-foreground">· optional</span>}
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={detailsId}
            className="mt-1 flex w-full items-start justify-between gap-2 rounded-sm text-left"
          >
            <span className={cn("text-lg font-bold leading-snug tracking-tight", (done || skipped) && "text-muted-foreground", done && "line-through decoration-2")}>
              {item.title}
            </span>
            <ChevronDown className={cn("mt-1.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
          </button>
          {(showPlanName || item.contextActivity) && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {[item.contextActivity && `During ${item.contextActivity.toLowerCase()}`, showPlanName && item.planTitle].filter(Boolean).join(" · ")}
            </p>
          )}
          {skipped && <p className="mt-1 text-sm text-muted-foreground">Skipped for today.</p>}

          <div id={detailsId} hidden={!open} className="mt-3 space-y-3 border-t-2 border-dashed border-ink/15 pt-3">
            <p className="leading-relaxed text-ink-soft">{item.instructions}</p>
            <Link
              href={`${routes.plans}/${item.planId}`}
              className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold underline decoration-2 underline-offset-4"
            >
              Open routine <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {skipped ? (
            <Button size="sm" variant="ghost" iconLeft={<Undo2 aria-hidden />} onClick={onUndo} className="h-11">
              Undo
            </Button>
          ) : (
            <>
              <button
                type="button"
                onClick={onDone}
                aria-pressed={done}
                aria-label={done ? `Mark ${item.title} as not done` : `Mark ${item.title} as done`}
                className={cn(
                  "grid size-11 place-items-center rounded-md border-2 border-ink transition-[transform,box-shadow,background-color] duration-100",
                  done ? "bg-ink text-accent" : "bg-surface shadow-hard-xs hover:bg-accent-soft active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
                )}
              >
                <Check className={cn("size-5", done && "animate-pop")} strokeWidth={3} aria-hidden />
              </button>
              {!done && (
                <Menu
                  label={`More for ${item.title}`}
                  triggerClassName="grid size-11 place-items-center rounded-md border-2 border-transparent hover:border-ink hover:bg-background"
                  trigger={<MoreHorizontal className="size-5" aria-hidden />}
                  items={[
                    { label: "Move today", icon: Clock, onSelect: onMove },
                    { label: "Skip today", icon: SkipForward, onSelect: onSkip },
                  ]}
                />
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function MoveDialog({
  item,
  current,
  date,
  timeZone,
  onClose,
  onSave,
}: {
  item: AgendaItem;
  current: number | null;
  date: string;
  timeZone: string;
  onClose: () => void;
  onSave: (movedTo: number | null) => void;
}) {
  const base = toMinutes(item.originalTime);
  const [time, setTime] = useState(fromMinutes(Math.min(base + 30, 23 * 60 + 45)));
  const quick = [15, 30, 60, 120].map((d) => base + d).filter((m) => m < 24 * 60);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Move today"
      description={`Just today. ${item.title} stays at ${formatClock(item.originalTime)} on other days.`}
      footer={
        <>
          {current !== null && (
            <Button variant="ghost" onClick={() => onSave(null)}>
              Back to {formatClock(item.originalTime)}
            </Button>
          )}
          <Button onClick={() => onSave(zonedToUtc(date, time, timeZone))} iconLeft={<Clock aria-hidden />}>
            Move to {formatClock(time)}
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        {quick.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setTime(fromMinutes(m))}
            aria-pressed={time === fromMinutes(m)}
            className="min-h-11 rounded-md border-2 border-ink bg-surface px-3 font-mono text-sm font-bold aria-pressed:bg-accent"
          >
            {formatClock(fromMinutes(m))}
          </button>
        ))}
      </div>
      <label className="mt-5 block space-y-2">
        <span className="text-sm font-semibold">Or pick a time</span>
        <input type="time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} className={cn(controlClasses, "h-12")} />
      </label>
    </Dialog>
  );
}

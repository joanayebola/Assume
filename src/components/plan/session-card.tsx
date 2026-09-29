"use client";

import { CalendarPlus, ChevronDown, Copy, Lightbulb, MoreHorizontal, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatClock } from "@/lib/intake/format";
import type { PlanDoc, Session } from "@/lib/plan/schema";
import { recurrenceText, techniqueLabel, toneClasses, toneOf } from "@/lib/plan/view";
import { cn } from "@/lib/utils";

import { AutoTextarea } from "../intake/controls";

export type RegenState = { status: "idle" } | { status: "working" } | { status: "error"; message: string };

function Content({ session, doc, full }: { session: Session; doc: PlanDoc; full: boolean }) {
  const affirmations = session.affirmationIds.map((id) => doc.affirmations.find((a) => a.id === id)?.text).filter(Boolean) as string[];
  const questions = session.askfirmationIds.map((id) => doc.askfirmations.find((a) => a.id === id)?.text).filter(Boolean) as string[];
  const limit = full ? Infinity : 2;

  return (
    <div className="space-y-2">
      {affirmations.length > 0 && (
        <ul className="space-y-1.5" aria-label="Affirmations">
          {affirmations.slice(0, limit).map((a) => (
            <li key={a} className="rounded-sm border-l-4 border-accent bg-background px-3 py-1.5 text-[0.95rem] font-medium">
              {a}
            </li>
          ))}
          {!full && affirmations.length > limit && (
            <li className="px-1 text-xs text-muted-foreground">+{affirmations.length - limit} more</li>
          )}
        </ul>
      )}
      {questions.length > 0 && (
        <ul className="space-y-1.5" aria-label="Askfirmations">
          {questions.slice(0, limit).map((q) => (
            <li key={q} className="rounded-sm border-l-4 border-ink bg-background px-3 py-1.5 text-[0.95rem] font-medium">
              {q}
            </li>
          ))}
          {!full && questions.length > limit && <li className="px-1 text-xs text-muted-foreground">+{questions.length - limit} more</li>}
        </ul>
      )}
      {session.visualizationPrompt && (
        <p className={cn("rounded-sm bg-background px-3 py-2 text-[0.95rem] italic", !full && "line-clamp-2")}>
          <span className="sr-only">Scene: </span>
          {session.visualizationPrompt}
        </p>
      )}
      {session.scriptingPrompt && (
        <p className={cn("rounded-sm bg-background px-3 py-2 text-[0.95rem]", !full && "line-clamp-2")}>
          <span className="font-semibold">Write: </span>
          {session.scriptingPrompt}
        </p>
      )}
    </div>
  );
}

function OptionsMenu({
  onEdit,
  onDuplicate,
  onRegenerate,
  onRemove,
  onAddToCalendar,
  disabled,
  title,
}: {
  onEdit: () => void;
  onDuplicate: () => void;
  onRegenerate: () => void;
  onRemove: () => void;
  onAddToCalendar: () => void;
  disabled: boolean;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = (label: string, Icon: typeof Pencil, action: () => void, danger = false) => (
    <li>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          action();
        }}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-sm px-3 py-2.5 text-left text-sm font-semibold hover:bg-ink/5",
          danger && "text-destructive",
        )}
      >
        <Icon className="size-4" aria-hidden />
        {label}
      </button>
    </li>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Options for ${title}`}
        className="-mr-1 -mt-1 grid size-11 place-items-center rounded-md border-2 border-transparent hover:border-ink hover:bg-background disabled:opacity-40"
      >
        <MoreHorizontal className="size-5" aria-hidden />
      </button>
      {open && (
        <ul
          id={menuId}
          className="absolute right-0 top-10 z-20 w-60 rounded-md border-2 border-ink bg-surface p-1 shadow-hard-md animate-pop"
        >
          {item("Edit session", Pencil, onEdit)}
          {item("Regenerate this session", RefreshCw, onRegenerate)}
          {item("Duplicate", Copy, onDuplicate)}
          {item("Add to calendar", CalendarPlus, onAddToCalendar)}
          {item("Remove", Trash2, onRemove, true)}
        </ul>
      )}
    </div>
  );
}

export function SessionCard({
  session,
  doc,
  onEdit,
  onDuplicate,
  onRemove,
  onRegenerate,
  onAddToCalendar,
  regen,
  disabled,
  highlight = false,
}: {
  session: Session;
  doc: PlanDoc;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onRegenerate: (note: string) => void;
  onAddToCalendar: () => void;
  regen: RegenState;
  disabled: boolean;
  highlight?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<"view" | "regenerate" | "confirm-remove">("view");
  const [note, setNote] = useState("");
  const detailsId = useId();
  const working = regen.status === "working";
  const tone = toneOf(session.technique);

  return (
    <article
      id={`session-${session.id}`}
      aria-busy={working || undefined}
      className={cn(
        "relative scroll-mt-28 rounded-lg border-2 border-ink bg-surface transition-shadow",
        highlight ? "shadow-hard-md" : "shadow-hard-xs",
        session.optional && "border-dashed",
      )}
    >
      <div className="flex gap-3 p-4 sm:gap-5 sm:p-5">
        <div className="w-16 shrink-0 pt-0.5 sm:w-20">
          <time className="block font-mono text-sm font-bold tabular-nums">{formatClock(session.startTime)}</time>
          <span className="mt-0.5 block font-mono text-xs text-muted-foreground">{session.durationMinutes} min</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "rounded-xs border-2 px-1.5 py-0.5 font-mono text-[0.68rem] font-semibold uppercase tracking-wider",
                  toneClasses[tone],
                )}
              >
                {techniqueLabel(session)}
              </span>
              {session.contextActivity && (
                <span className="rounded-xs border-2 border-ink/20 px-1.5 py-0.5 text-[0.7rem] font-semibold">
                  During {session.contextActivity.toLowerCase()}
                </span>
              )}
              {session.optional && <span className="text-xs font-semibold text-muted-foreground">Optional</span>}
              {session.flexibleTiming && <span className="text-xs text-muted-foreground">· flexible time</span>}
            </div>
            <OptionsMenu
              title={session.title}
              disabled={disabled || working}
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onRegenerate={() => setMode("regenerate")}
              onRemove={() => setMode("confirm-remove")}
              onAddToCalendar={onAddToCalendar}
            />
          </div>

          <h3 className="mt-2 text-lg font-bold leading-snug tracking-tight">{session.title}</h3>
          <p className={cn("mt-1 leading-relaxed text-ink-soft", !expanded && "line-clamp-2")}>{session.instructions}</p>

          <div className="mt-3">
            <Content session={session} doc={doc} full={expanded} />
          </div>

          <div id={detailsId} hidden={!expanded} className="mt-4 space-y-3 border-t-2 border-dashed border-ink/15 pt-4 text-sm">
            <p className="text-muted-foreground">
              <span className="font-semibold text-ink">{recurrenceText(session)}</span>
              {session.flexibleTiming ? " · the exact time can move" : " · at this time"}
            </p>
            {session.notes && <p className="leading-relaxed">{session.notes}</p>}
            {session.fitReason && (
              <div className="flex gap-2 rounded-md bg-background p-3">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-hidden />
                <p className="leading-relaxed">
                  <span className="font-semibold">Why this fits here: </span>
                  {session.fitReason}
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={detailsId}
            className="mt-3 inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-muted-foreground hover:text-ink"
          >
            {expanded ? "Less" : "Details"}
            <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} aria-hidden />
          </button>
        </div>
      </div>

      {mode === "regenerate" && !working && (
        <div className="animate-rise border-t-2 border-ink bg-background p-4 sm:p-5">
          <label htmlFor={`note-${session.id}`} className="text-sm font-semibold">
            Anything you&apos;d like different? <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <AutoTextarea
            id={`note-${session.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            minRows={2}
            maxLength={500}
            placeholder="e.g. Something I can do with my eyes open"
            className="mt-2"
          />
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" size="sm" onClick={() => setMode("view")}>
              Cancel
            </Button>
            <Button
              size="sm"
              iconLeft={<RefreshCw aria-hidden />}
              onClick={() => {
                onRegenerate(note);
                setMode("view");
                setNote("");
              }}
            >
              Regenerate this session
            </Button>
          </div>
        </div>
      )}

      {mode === "confirm-remove" && (
        <div role="alertdialog" aria-label="Remove session?" className="animate-rise flex flex-col gap-3 border-t-2 border-ink bg-destructive-soft p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <p className="text-sm font-semibold">Remove “{session.title}”? You can restore it from version history.</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setMode("view")} autoFocus>
              Keep
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setMode("view");
                onRemove();
              }}
            >
              Remove
            </Button>
          </div>
        </div>
      )}

      {regen.status === "error" && (
        <p role="alert" className="border-t-2 border-ink bg-destructive-soft px-4 py-3 text-sm font-medium sm:px-5">
          {regen.message}
        </p>
      )}

      {working && (
        <div className="absolute inset-0 grid place-items-center rounded-[inherit] bg-surface/85 backdrop-blur-[1px]">
          <p className="inline-flex items-center gap-2 font-semibold" role="status">
            <Spinner className="size-4" /> Finding a fresh alternative…
          </p>
        </div>
      )}
    </article>
  );
}

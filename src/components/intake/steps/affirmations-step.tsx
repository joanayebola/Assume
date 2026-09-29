"use client";

import { GripVertical, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { affirmationModeOptions } from "@/content/intake";
import type { AffirmationItem } from "@/lib/intake/model";
import { cn } from "@/lib/utils";

import { AutoTextarea, ChoiceCard, FieldError, Question } from "../controls";
import type { StepProps } from "./types";

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `a-${Date.now()}-${Math.random()}`;

function move<T>(list: T[], from: number, to: number) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function AffirmationList({
  items,
  onChange,
  error,
}: {
  items: AffirmationItem[];
  onChange: (items: AffirmationItem[]) => void;
  error?: string;
}) {
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const inputRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const handleRefs = useRef(new Map<string, HTMLButtonElement>());
  const [dragId, setDragId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const focusNext = useRef<{ id: string; target: "input" | "handle" } | null>(null);

  useEffect(() => {
    const f = focusNext.current;
    if (!f) return;
    focusNext.current = null;
    const el = f.target === "input" ? inputRefs.current.get(f.id) : handleRefs.current.get(f.id);
    el?.focus();
  });

  const update = (id: string, text: string) => onChange(items.map((i) => (i.id === id ? { ...i, text } : i)));

  const add = (afterIndex = items.length - 1) => {
    const item = { id: newId(), text: "" };
    const next = [...items];
    next.splice(afterIndex + 1, 0, item);
    focusNext.current = { id: item.id, target: "input" };
    onChange(next);
  };

  const remove = (index: number) => {
    const prev = items[index - 1] ?? items[index + 1];
    if (prev) focusNext.current = { id: prev.id, target: "input" };
    onChange(items.filter((_, i) => i !== index));
  };

  const reorder = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    onChange(move(items, from, to));
    setAnnouncement(`Moved to position ${to + 1} of ${items.length}.`);
  };

  // Pointer drag on the handle (works for mouse, pen and touch).
  const onPointerDown = (e: PointerEvent<HTMLButtonElement>, id: string) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragId(id);
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!dragId) return;
    const from = items.findIndex((i) => i.id === dragId);
    for (let to = 0; to < items.length; to++) {
      if (to === from) continue;
      const rect = rowRefs.current.get(items[to].id)?.getBoundingClientRect();
      if (!rect) continue;
      const mid = rect.top + rect.height / 2;
      if ((to < from && e.clientY < mid) || (to > from && e.clientY > mid)) {
        reorder(from, to);
        break;
      }
    }
  };
  const endDrag = () => setDragId(null);

  const onHandleKey = (e: KeyboardEvent<HTMLButtonElement>, index: number, id: string) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      focusNext.current = { id, target: "handle" };
      reorder(index, e.key === "ArrowUp" ? index - 1 : index + 1);
    }
  };

  return (
    <div className="space-y-3">
      <ol className="space-y-2.5">
        {items.map((item, index) => (
          <li
            key={item.id}
            ref={(el) => {
              if (el) rowRefs.current.set(item.id, el);
              else rowRefs.current.delete(item.id);
            }}
            className={cn(
              "flex items-start gap-1 rounded-md border-2 border-ink bg-surface p-1.5 transition-shadow",
              dragId === item.id && "relative z-10 shadow-hard-md",
            )}
          >
            <button
              type="button"
              ref={(el) => {
                if (el) handleRefs.current.set(item.id, el);
                else handleRefs.current.delete(item.id);
              }}
              aria-label={`Reorder affirmation ${index + 1}. Use the up and down arrow keys to move it.`}
              onPointerDown={(e) => onPointerDown(e, item.id)}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={(e) => onHandleKey(e, index, item.id)}
              className={cn(
                "mt-1 grid size-9 shrink-0 touch-none place-items-center rounded-sm text-muted-foreground hover:bg-ink/5 hover:text-ink",
                items.length < 2 && "invisible",
                dragId === item.id ? "cursor-grabbing" : "cursor-grab",
              )}
            >
              <GripVertical className="size-5" aria-hidden />
            </button>
            <label className="sr-only" htmlFor={`aff-${item.id}`}>
              Affirmation {index + 1}
            </label>
            <AutoTextarea
              id={`aff-${item.id}`}
              ref={(el) => {
                if (el) inputRefs.current.set(item.id, el);
                else inputRefs.current.delete(item.id);
              }}
              value={item.text}
              minRows={1}
              maxLength={500}
              placeholder={index === 0 ? "I am…" : "Another affirmation"}
              autoCapitalize="sentences"
              enterKeyHint="next"
              onChange={(e) => update(item.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  add(index);
                } else if (e.key === "Backspace" && item.text === "" && items.length > 1) {
                  e.preventDefault();
                  remove(index);
                }
              }}
              className="flex-1 border-0 bg-transparent px-2 py-2 text-lg focus-visible:translate-x-0 focus-visible:translate-y-0 focus-visible:shadow-none focus-visible:outline-2 focus-visible:outline-offset-0"
            />
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`Delete affirmation ${index + 1}`}
              className="mt-1 grid size-9 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-destructive-soft hover:text-ink"
            >
              <X className="size-5" aria-hidden />
            </button>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => add()}
        disabled={items.length >= 30}
        className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-ink/40 px-4 py-3 font-semibold text-ink transition-colors hover:border-ink hover:bg-surface disabled:opacity-50"
      >
        <Plus className="size-4" aria-hidden />
        Add {items.length ? "another" : "an affirmation"}
      </button>
      {items.length > 1 && (
        <p className="text-sm text-muted-foreground">Drag the handle to reorder. Press Enter for a new line.</p>
      )}
      <FieldError id="items-error" message={error} />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

export function AffirmationsStep({ value, onChange, issues }: StepProps<"affirmations">) {
  const setMode = (mode: typeof value.mode) => {
    // Seed one empty row the first time someone chooses to add their own.
    const items = mode === "own" && value.items.length === 0 ? [{ id: newId(), text: "" }] : value.items;
    onChange({ mode, items });
  };

  return (
    <div className="space-y-12">
      <Question id="mode" as="fieldset" title="Do you already have affirmations you want to use?" error={issues.mode}>
        <div className="grid gap-3">
          {affirmationModeOptions.map((o) => (
            <ChoiceCard
              key={o.value}
              name="affirmation-mode"
              value={o.value}
              checked={value.mode === o.value}
              onChange={() => setMode(o.value)}
              label={o.label}
              description={o.description}
            />
          ))}
        </div>
      </Question>

      {value.mode === "own" && (
        <div className="animate-rise space-y-4">
          <h3 className="font-display text-xl font-bold tracking-tight">Your affirmations</h3>
          <AffirmationList
            items={value.items}
            onChange={(items) => onChange({ ...value, items })}
            error={issues.items}
          />
        </div>
      )}

      {value.mode === "generate" && (
        <div className="flex animate-rise gap-3 rounded-lg border-2 border-ink bg-accent-soft p-5">
          <Sparkles className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p className="leading-relaxed">
            We&apos;ll write a handful based on your desire when we build your routine. You can edit or remove
            any of them afterwards.
          </p>
        </div>
      )}

      {value.mode === "none" && (
        <p className="animate-rise rounded-lg border-2 border-ink/20 bg-surface p-5 leading-relaxed text-muted-foreground">
          No problem — your routine won&apos;t include affirmations.
        </p>
      )}
    </div>
  );
}

"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Modal built on the native <dialog> element: focus trapping, Escape and the
 * inert background come from the browser. On phones it's a bottom sheet that
 * scrolls internally, so the keyboard never hides the actions.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Click on the backdrop (the dialog element itself) closes.
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby={titleId}
      className={cn(
        "m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-xl border-2 border-b-0 border-ink bg-background p-0 text-ink shadow-hard-lg",
        "backdrop:bg-ink/40 open:flex open:flex-col open:animate-rise",
        "sm:m-auto sm:max-h-[88dvh] sm:max-w-xl sm:rounded-xl sm:border-b-2",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b-2 border-ink px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 id={titleId} className="font-display text-2xl font-bold tracking-tight">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 grid size-10 shrink-0 place-items-center rounded-md hover:bg-ink/5"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>
      {footer && (
        <div className="pb-safe flex flex-col-reverse gap-2 border-t-2 border-ink bg-surface px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          {footer}
        </div>
      )}
    </dialog>
  );
}

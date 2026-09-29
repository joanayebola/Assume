"use client";

import type { LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type MenuItem = { label: string; icon: LucideIcon; onSelect: () => void; danger?: boolean; hidden?: boolean };

/** A small popover menu: closes on outside click, Escape, or selection. */
export function Menu({
  label,
  trigger,
  items,
  disabled,
  triggerClassName,
  align = "right",
}: {
  label: string;
  trigger: ReactNode;
  items: MenuItem[];
  disabled?: boolean;
  triggerClassName?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <ul
          id={id}
          className={cn(
            "absolute top-full z-30 mt-2 w-64 rounded-md border-2 border-ink bg-surface p-1 shadow-hard-md animate-pop",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {items
            .filter((i) => !i.hidden)
            .map(({ label: itemLabel, icon: Icon, onSelect, danger }) => (
              <li key={itemLabel}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onSelect();
                  }}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2.5 rounded-sm px-3 py-2.5 text-left text-sm font-semibold hover:bg-ink/5",
                    danger && "text-destructive",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {itemLabel}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

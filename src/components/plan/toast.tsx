"use client";

import { CircleAlert, CircleCheck, X } from "lucide-react";

import { cn } from "@/lib/utils";

import type { Toast as ToastType } from "./use-plan";

/** A single polite toast, above the mobile bottom nav. */
export function Toast({ toast, onDismiss }: { toast: ToastType | null; onDismiss: () => void }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-gutter lg:bottom-6"
    >
      {toast && (
        <div
          key={toast.id}
          role={toast.tone === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex max-w-md items-start gap-3 rounded-md border-2 border-ink px-4 py-3 text-sm font-medium shadow-hard-md animate-pop",
            toast.tone === "error" ? "bg-destructive-soft" : "bg-surface",
          )}
        >
          {toast.tone === "error" ? (
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          <span>{toast.message}</span>
          <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-mr-1 rounded-sm p-0.5 hover:bg-ink/5">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

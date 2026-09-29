"use client";

import { Check, CloudOff, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";

import type { SaveState } from "./use-autosave";

const copy: Record<SaveState, string> = {
  idle: "",
  pending: "Saving…",
  saving: "Saving…",
  saved: "Saved",
  retrying: "Couldn't save — retrying",
  offline: "Offline — will save when you're back",
};

/** Subtle, polite save status. Screen readers hear changes without focus moving. */
export function SaveIndicator({ state }: { state: SaveState }) {
  const text = copy[state];
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex min-h-5 items-center gap-1.5 font-mono text-xs font-semibold transition-opacity duration-300",
        state === "idle" ? "opacity-0" : "opacity-100",
        state === "retrying" || state === "offline" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {(state === "saving" || state === "pending") && (
        <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-accent" />
      )}
      {state === "saved" && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
      {state === "retrying" && <RefreshCw className="size-3.5" aria-hidden />}
      {state === "offline" && <CloudOff className="size-3.5" aria-hidden />}
      <span className={cn(state === "retrying" || state === "offline" ? "" : "max-sm:sr-only")}>{text}</span>
    </p>
  );
}

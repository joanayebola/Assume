"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { saveIntakeSection, type SaveResult } from "@/lib/actions/intake";
import type { SectionKey } from "@/lib/intake/model";

export type SaveState = "idle" | "pending" | "saving" | "saved" | "retrying" | "offline";
export type FatalReason = "locked" | "not_found" | "auth";

const DEBOUNCE_MS = 700;
const RETRY_STEPS_MS = [2000, 5000, 10000, 20000];

/**
 * Debounced, serialised autosave for intake sections.
 *
 * - Only the latest value per section is kept, so bursts of typing produce
 *   one request.
 * - Saves run one at a time, in order.
 * - Failures keep the data queued and retry with backoff; coming back online
 *   triggers an immediate retry.
 * - `flush()` saves everything now (used before changing step / leaving).
 */
export function useAutosave(intakeId: string) {
  const [state, setState] = useState<SaveState>("idle");
  const [fatal, setFatal] = useState<FatalReason | null>(null);

  const pending = useRef(new Map<SectionKey, unknown>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Promise<boolean> | null>(null);
  const attempt = useRef(0);
  const fatalRef = useRef<FatalReason | null>(null);
  // Lets a failed save schedule a retry of itself.
  const retryRef = useRef<() => void>(() => undefined);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const drain = useCallback(async (): Promise<boolean> => {
    // Wait for an in-flight run, then drain whatever is left.
    if (running.current) await running.current;
    if (fatalRef.current) return false;
    if (pending.current.size === 0) return true;

    const run = (async () => {
      setState("saving");
      while (pending.current.size > 0) {
        const [section, data] = pending.current.entries().next().value as [SectionKey, unknown];
        pending.current.delete(section);

        let result: SaveResult;
        try {
          result = await saveIntakeSection({ intakeId, section, data });
        } catch {
          result = { ok: false, code: "error", message: "Network error" };
        }

        if (!result.ok) {
          if (result.code === "locked" || result.code === "not_found" || result.code === "auth") {
            fatalRef.current = result.code;
            setFatal(result.code);
            pending.current.clear();
            setState("idle");
            return false;
          }
          // Re-queue unless a newer value arrived meanwhile.
          if (!pending.current.has(section)) pending.current.set(section, data);
          const offline = typeof navigator !== "undefined" && !navigator.onLine;
          setState(offline ? "offline" : "retrying");
          if (!offline) {
            const delay = RETRY_STEPS_MS[Math.min(attempt.current, RETRY_STEPS_MS.length - 1)];
            attempt.current += 1;
            clearTimer();
            timer.current = setTimeout(() => retryRef.current(), delay);
          }
          return false;
        }
      }
      attempt.current = 0;
      setState("saved");
      return true;
    })();

    running.current = run;
    try {
      return await run;
    } finally {
      running.current = null;
    }
  }, [intakeId]);

  useEffect(() => {
    retryRef.current = () => void drain();
  }, [drain]);

  const schedule = useCallback(
    (section: SectionKey, data: unknown) => {
      if (fatalRef.current) return;
      pending.current.set(section, data);
      setState((s) => (s === "saving" ? s : "pending"));
      clearTimer();
      timer.current = setTimeout(() => void drain(), DEBOUNCE_MS);
    },
    [drain],
  );

  const flush = useCallback(async () => {
    clearTimer();
    const ok = await drain();
    // A save may have been scheduled while we were draining.
    return ok && pending.current.size === 0 ? true : ok ? drain() : false;
  }, [drain]);

  useEffect(() => {
    const onOnline = () => void flush();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current.size > 0 || running.current) {
        void flush();
        e.preventDefault();
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onHide);
      clearTimer();
    };
  }, [flush]);

  return { state, fatal, schedule, flush };
}

"use client";

import { ArrowLeft, RotateCcw, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { retryGeneration } from "@/lib/actions/plan";
import type { GenerationStatusResponse } from "@/lib/generation/present";
import { routes } from "@/lib/site";
import { cn } from "@/lib/utils";


const MESSAGES = {
  initial: [
    "Looking at your schedule…",
    "Finding the spaces that actually fit…",
    "Matching methods to moments…",
    "Building your practice…",
    "Putting everything together…",
  ],
  adjust: ["Reading your routine…", "Making the changes you asked for…", "Leaving your own edits alone…", "Putting everything together…"],
  regenerate_session: ["Looking at that part of your day…", "Finding a fresh alternative…", "Putting it in place…"],
} as const;

const POLL_MS = 2000;
const NUDGE_EVERY_MS = 20_000;
const MESSAGE_MS = 3800;

/** The routine taking shape: slots fill in turn (static for reduced motion). */
function Assembling({ done = false }: { done?: boolean }) {
  const slots = ["Morning", "Commute", "Midday", "Evening", "Bedtime"];
  return (
    <div aria-hidden className="rounded-xl border-2 border-ink bg-surface p-5 shadow-hard-lg">
      <ol className="space-y-2.5">
        {slots.map((s, i) => (
          <li key={s} className="grid grid-cols-[4.75rem_1fr] items-center gap-3">
            <span className="font-mono text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">{s}</span>
            <span className="relative h-9 overflow-hidden rounded-md border-2 border-dashed border-ink/30">
              <span
                className={cn(
                  "absolute inset-0 origin-left rounded-[3px] bg-accent motion-reduce:animate-none",
                  done ? "" : "animate-[fill-slot_2.8s_ease-in-out_infinite]",
                )}
                style={{ animationDelay: `${i * 0.35}s` }}
              />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function GenerationProgress({
  initial,
  backHref,
}: {
  initial: GenerationStatusResponse;
  /** Where "back" goes: home for new plans, the plan for adjustments. */
  backHref: string;
}) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [messageIndex, setMessageIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const lastNudge = useRef(0);
  const started = useRef(0);

  const messages = MESSAGES[state.kind];
  const live = state.status === "queued" || state.status === "processing";

  const poll = useCallback(
    async (method: "GET" | "POST") => {
      try {
        const res = await fetch(`/api/generation/${state.id}`, { method, cache: "no-store" });
        if (res.ok) setState((await res.json()) as GenerationStatusResponse);
      } catch {
        // Network blips: keep polling; the next tick will catch up.
      }
    },
    [state.id],
  );

  // Poll while live; nudge the runner if nobody seems to have picked it up.
  useEffect(() => {
    if (!live) return;
    if (!started.current) started.current = Date.now();
    const tick = async () => {
      const now = Date.now();
      const nudge = now - lastNudge.current > NUDGE_EVERY_MS;
      if (nudge) lastNudge.current = now;
      await poll(nudge ? "POST" : "GET");
      setElapsed(Math.round((Date.now() - started.current) / 1000));
    };
    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => clearInterval(id);
  }, [live, poll]);

  // Rotate status messages, holding on the last one.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setMessageIndex((i) => Math.min(i + 1, messages.length - 1)), MESSAGE_MS);
    return () => clearInterval(id);
  }, [live, messages.length]);

  // Done → go to the plan.
  useEffect(() => {
    if (state.status === "completed" && state.planId) {
      router.replace(`${routes.plans}/${state.planId}`);
      router.refresh();
    }
  }, [state.status, state.planId, router]);

  const onRetry = async () => {
    setRetrying(true);
    setRetryError(null);
    const result = await retryGeneration(state.id);
    setRetrying(false);
    if (!result.ok) {
      setRetryError(result.message);
      return;
    }
    started.current = Date.now();
    lastNudge.current = Date.now();
    setMessageIndex(0);
    setElapsed(0);
    setState((s) => ({ ...s, status: "queued", error: null }));
  };

  const failed = state.status === "failed" || Boolean(state.error);
  const done = state.status === "completed";

  return (
    <div className="grid w-full items-center gap-12 md:grid-cols-[1.1fr_0.9fr] md:gap-16">
      <div className="animate-rise">
        <p
          className={cn(
            "inline-flex items-center gap-2 rounded-sm border-2 border-ink px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wider",
            failed ? "bg-destructive-soft" : done ? "bg-success-soft" : "bg-surface",
          )}
        >
          {live && !failed && <span aria-hidden className="size-2 animate-pulse rounded-full bg-accent" />}
          {failed ? "Needs attention" : done ? "Ready" : state.status === "processing" ? "Building" : "Starting"}
        </p>

        <h1 className="mt-6 text-display-lg font-extrabold">
          {failed ? "We hit a snag." : done ? "Your routine is ready." : state.kind === "initial" ? "Building your routine." : "Updating your routine."}
        </h1>

        <div className="mt-5 min-h-16 max-w-md" role="status" aria-live="polite">
          {failed ? (
            <p className="text-lg leading-relaxed text-muted-foreground">
              {state.error?.message ?? "Something went wrong."} Your answers are safe
              {state.kind === "initial" ? "" : ", and your current routine hasn't changed"}.
            </p>
          ) : done ? (
            <p className="text-lg text-muted-foreground">Opening it now…</p>
          ) : (
            <>
              <p key={messageIndex} className="animate-rise font-display text-2xl font-bold tracking-tight">
                {messages[messageIndex]}
              </p>
              {elapsed > 45 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  This one&apos;s taking a little longer than usual. You can leave — we&apos;ll keep going and it&apos;ll be here when you
                  come back.
                </p>
              )}
            </>
          )}
        </div>

        <p className="mt-6 font-display text-xl font-bold tracking-tight">
          <span className="text-muted-foreground">For:</span> {state.title}
        </p>

        {retryError && <p className="mt-4 text-sm font-medium text-destructive">{retryError}</p>}

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          {failed && state.error?.canRetry && (
            <Button onClick={onRetry} loading={retrying} loadingText="Retrying…" iconLeft={<RotateCcw aria-hidden />}>
              Try again
            </Button>
          )}
          <ButtonLink href={backHref} variant={failed ? "secondary" : "ghost"} iconLeft={<ArrowLeft aria-hidden />}>
            {state.kind === "initial" ? "Back to home" : "Back to my routine"}
          </ButtonLink>
        </div>
        {!failed && !done && (
          <p className="mt-6 text-sm text-muted-foreground">You can close this page — building continues without you.</p>
        )}
      </div>

      {failed ? (
        <div aria-hidden className="grid place-items-center rounded-xl border-2 border-dashed border-ink/30 p-10">
          <TriangleAlert className="size-14 text-muted-foreground" />
        </div>
      ) : (
        <Assembling done={done} />
      )}
    </div>
  );
}

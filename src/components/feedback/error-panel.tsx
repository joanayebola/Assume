"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { Button, ButtonLink } from "@/components/ui/button";

/** Shared body for route-level error boundaries. */
export function ErrorPanel({
  error,
  retry,
  homeHref = "/",
  homeLabel = "Go home",
}: {
  error: Error & { digest?: string };
  retry: () => void;
  homeHref?: string;
  homeLabel?: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto w-full max-w-lg rounded-xl border-2 border-ink bg-surface p-6 shadow-hard-lg animate-pop sm:p-8">
      <span className="grid size-12 place-items-center rounded-md border-2 border-ink bg-destructive-soft">
        <TriangleAlert className="size-6" aria-hidden />
      </span>
      <h1 className="mt-5 text-display-sm font-extrabold">Something went sideways.</h1>
      <p className="mt-3 leading-relaxed text-muted-foreground">
        That didn&apos;t load properly. It&apos;s usually temporary — try again, and if it keeps happening,
        come back in a few minutes.
      </p>
      {error.digest && (
        <p className="mt-4 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
      )}
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <Button onClick={retry} iconLeft={<RotateCcw aria-hidden />}>
          Try again
        </Button>
        <ButtonLink href={homeHref} variant="secondary">
          {homeLabel}
        </ButtonLink>
      </div>
    </div>
  );
}

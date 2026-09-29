"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { discardIntake } from "@/lib/actions/intake";
import { cn } from "@/lib/utils";

function ConfirmSubmit({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus();
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <span className="flex items-center gap-1 animate-pop">
      <button
        ref={ref}
        type="submit"
        disabled={pending}
        className="h-11 rounded-md border-2 border-ink bg-destructive px-3 text-sm font-semibold text-surface disabled:opacity-60"
      >
        {pending ? "Discarding…" : "Discard"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="h-11 rounded-md px-3 text-sm font-semibold hover:bg-ink/5"
      >
        Keep
      </button>
    </span>
  );
}

/** Two-step discard so a stray tap never loses someone's answers. */
export function DiscardDraftButton({ intakeId, title }: { intakeId: string; title: string }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <form action={discardIntake.bind(null, intakeId)}>
      {confirming ? (
        <ConfirmSubmit onCancel={() => setConfirming(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Discard ${title}`}
          className={cn(
            "grid size-11 place-items-center rounded-md border-2 border-transparent text-muted-foreground",
            "hover:border-ink hover:bg-destructive-soft hover:text-ink",
          )}
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      )}
    </form>
  );
}

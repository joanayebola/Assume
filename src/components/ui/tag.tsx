import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type Tone = "ink" | "accent" | "surface" | "soft" | "success";

const tones: Record<Tone, string> = {
  ink: "bg-ink text-surface",
  accent: "bg-accent text-ink",
  surface: "bg-surface text-ink",
  soft: "bg-accent-soft text-ink",
  success: "bg-success-soft text-ink",
};

export type TagProps = ComponentProps<"span"> & {
  tone?: Tone;
  /** Sticker style: hard shadow + slight tilt. */
  sticker?: boolean;
  tilt?: "left" | "right";
};

/**
 * Small uppercase label. As a "sticker" it gets a shadow and a tilt —
 * use sparingly to add playful asymmetry to otherwise square layouts.
 */
export function Tag({ tone = "surface", sticker = false, tilt, className, ...props }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border-2 border-ink px-2 py-0.5",
        "font-mono text-[0.72rem] font-semibold uppercase leading-5 tracking-wider",
        "[&_svg]:size-3.5",
        tones[tone],
        sticker && "shadow-hard-xs",
        tilt === "left" && "-rotate-2",
        tilt === "right" && "rotate-2",
        className,
      )}
      {...props}
    />
  );
}

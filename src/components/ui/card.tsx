import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type Tone = "surface" | "paper" | "accent" | "ink" | "muted";
type Elevation = "none" | "sm" | "md" | "lg";

const tones: Record<Tone, string> = {
  surface: "bg-surface text-ink",
  paper: "bg-background text-ink",
  accent: "bg-accent text-ink",
  ink: "on-ink bg-ink text-surface",
  muted: "bg-muted text-ink",
};

const elevations: Record<Elevation, string> = {
  none: "",
  sm: "shadow-hard-sm",
  md: "shadow-hard-md",
  lg: "shadow-hard-lg",
};

export type CardProps = ComponentProps<"div"> & {
  tone?: Tone;
  elevation?: Elevation;
};

export function Card({ tone = "surface", elevation = "md", className, ...props }: CardProps) {
  return (
    <div
      className={cn("rounded-lg border-2 border-ink", tones[tone], elevations[elevation], className)}
      {...props}
    />
  );
}

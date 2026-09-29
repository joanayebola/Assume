import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      <span aria-hidden className="size-2 rounded-xs bg-accent" />
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  id,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={id} className="mt-4 text-display-md font-extrabold">
        {title}
      </h2>
      {description && <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  );
}

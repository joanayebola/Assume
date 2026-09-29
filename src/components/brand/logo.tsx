import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * The Assume mark: a geometric "A" on a Signal-orange tile with a hard
 * shadow. Built from primitives so it renders identically everywhere
 * (favicon, PWA icons, UI) without depending on a loaded font.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" aria-hidden className={cn("size-8 shrink-0", className)}>
      <rect x="5" y="5" width="30" height="30" rx="3" fill="var(--ink)" />
      <rect x="1.5" y="1.5" width="30" height="30" rx="3" fill="var(--accent)" stroke="var(--ink)" strokeWidth="3" />
      <path
        d="M9.5 25 L16.5 8 L23.5 25 M12.2 19 H20.8"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="3.6"
        strokeLinejoin="miter"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function Logo({
  href = "/",
  className,
  showWordmark = true,
}: {
  href?: string;
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn("group inline-flex items-center gap-2.5 rounded-sm", className)}
      aria-label="Assume — home"
    >
      <LogoMark className="transition-transform duration-150 group-hover:-rotate-6" />
      {showWordmark && (
        <span className="font-display text-2xl font-extrabold leading-none tracking-[-0.04em]">
          Assume
        </span>
      )}
    </Link>
  );
}

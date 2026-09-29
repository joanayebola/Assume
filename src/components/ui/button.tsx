import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "ink" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

const base =
  "group/button relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap " +
  "rounded-md border-2 border-ink font-sans font-semibold tracking-tight " +
  "transition-[transform,box-shadow,background-color] duration-100 ease-out " +
  "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 " +
  "[&_svg]:size-[1.1em] [&_svg]:shrink-0";

/* Tactile press: lift on hover, sink fully into the shadow on press. */
const tactile = {
  sm: "shadow-hard-xs hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
  md: "shadow-hard-sm hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-md active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
  lg: "shadow-hard-md hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-hard-lg active:translate-x-[5px] active:translate-y-[5px] active:shadow-none",
} satisfies Record<Size, string>;

const variants: Record<Variant, string> = {
  primary: "bg-accent text-ink hover:bg-accent-hover",
  secondary: "bg-surface text-ink hover:bg-background",
  ink: "on-ink bg-ink text-surface hover:bg-ink-soft",
  ghost: "border-transparent bg-transparent text-ink shadow-none hover:bg-ink/5 hover:border-ink",
  destructive: "bg-destructive text-surface hover:bg-destructive/90",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-[0.95rem]",
  lg: "h-14 px-7 text-lg",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  block = false,
  className,
}: {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  className?: string;
} = {}) {
  return cn(
    base,
    sizes[size],
    variants[variant],
    variant !== "ghost" && tactile[size],
    block && "w-full",
    className,
  );
}

type SharedProps = {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
};

export type ButtonProps = ComponentProps<"button"> &
  SharedProps & {
    loading?: boolean;
    loadingText?: string;
  };

export function Button({
  variant,
  size,
  block,
  className,
  iconLeft,
  iconRight,
  loading = false,
  loadingText,
  disabled,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, block, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-[1.1em]" /> : iconLeft}
      <span>{loading && loadingText ? loadingText : children}</span>
      {!loading && iconRight}
    </button>
  );
}

export type ButtonLinkProps = ComponentProps<typeof Link> & SharedProps;

export function ButtonLink({
  variant,
  size,
  block,
  className,
  iconLeft,
  iconRight,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, block, className })} {...props}>
      {iconLeft}
      <span>{children}</span>
      {iconRight && (
        <span className="transition-transform duration-150 group-hover/button:translate-x-0.5">
          {iconRight}
        </span>
      )}
    </Link>
  );
}

"use client";

import { Check, CircleAlert } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, type ComponentProps, type ReactNode } from "react";

import { controlClasses } from "@/components/ui/field";
import { formatClock } from "@/lib/intake/format";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Question — the conversational unit of every step                           */
/* -------------------------------------------------------------------------- */

export function Question({
  id,
  title,
  helper,
  optional,
  error,
  as = "div",
  children,
  className,
}: {
  id: string;
  title: ReactNode;
  helper?: ReactNode;
  optional?: boolean;
  error?: string;
  /** Use "fieldset" for groups of radios/checkboxes. */
  as?: "div" | "fieldset";
  children: ReactNode;
  className?: string;
}) {
  const Heading = as === "fieldset" ? "legend" : "label";
  const Wrapper = as;
  return (
    <Wrapper
      className={cn("min-w-0 space-y-4", className)}
      aria-describedby={as === "fieldset" && error ? `${id}-error` : undefined}
    >
      <div className="space-y-2">
        <Heading
          {...(Heading === "label" ? { htmlFor: id } : {})}
          className="block font-display text-2xl font-bold leading-tight tracking-tight sm:text-[1.75rem]"
        >
          {title}
          {optional && (
            <span className="ml-2 inline-block translate-y-[-0.2em] rounded-xs border-2 border-ink/25 px-1.5 align-middle font-mono text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Optional
            </span>
          )}
        </Heading>
        {helper && (
          <p id={`${id}-hint`} className="max-w-xl leading-relaxed text-muted-foreground">
            {helper}
          </p>
        )}
      </div>
      {children}
      <FieldError id={`${id}-error`} message={error} />
    </Wrapper>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm font-medium text-destructive animate-rise">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {message}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* AutoTextarea — grows with its content                                      */
/* -------------------------------------------------------------------------- */

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function AutoTextarea({
  className,
  minRows = 3,
  value,
  invalid,
  ref: externalRef,
  ...props
}: Omit<ComponentProps<"textarea">, "value" | "ref"> & {
  value: string;
  minRows?: number;
  invalid?: boolean;
  ref?: (el: HTMLTextAreaElement | null) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      ref.current = el;
      externalRef?.(el);
    },
    [externalRef],
  );

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 4}px`;
  }, []);

  useIsoLayoutEffect(resize, [value, resize]);

  return (
    <textarea
      ref={setRef}
      rows={minRows}
      value={value}
      aria-invalid={invalid || undefined}
      className={cn(controlClasses, "block resize-none overflow-hidden py-3 leading-relaxed", className)}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Choice cards — native radios/checkboxes with bold selected states          */
/* -------------------------------------------------------------------------- */

type ChoiceProps = {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label: ReactNode;
  description?: ReactNode;
  type?: "radio" | "checkbox";
  size?: "md" | "sm";
  className?: string;
};

export function ChoiceCard({
  name,
  value,
  checked,
  onChange,
  label,
  description,
  type = "radio",
  size = "md",
  className,
}: ChoiceProps) {
  return (
    <label
      className={cn(
        "group relative flex cursor-pointer items-start gap-3 rounded-lg border-2 border-ink bg-surface text-left select-none",
        "transition-[transform,box-shadow,background-color] duration-100 ease-out",
        "hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-sm",
        "active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
        "has-checked:bg-accent has-checked:shadow-hard-md has-checked:hover:shadow-hard-md",
        "has-focus-visible:outline-3 has-focus-visible:outline-offset-3 has-focus-visible:outline-ink",
        size === "md" ? "p-4 sm:p-5" : "px-4 py-3",
        className,
      )}
    >
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-6 shrink-0 place-items-center border-2 border-ink bg-background transition-colors",
          type === "radio" ? "rounded-full" : "rounded-xs",
          "peer-checked:bg-ink peer-checked:text-accent",
        )}
      >
        <Check className="size-3.5 scale-0 transition-transform duration-150 group-has-checked:scale-100" strokeWidth={3.5} />
      </span>
      <span className="min-w-0">
        <span className={cn("block font-semibold leading-snug tracking-tight", size === "md" && "text-lg")}>{label}</span>
        {description && (
          <span className="mt-1 block text-sm leading-relaxed text-muted-foreground group-has-checked:text-ink">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Segmented control (e.g. Yes / No)                                          */
/* -------------------------------------------------------------------------- */

export function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
  className,
  ariaLabel,
}: {
  name: string;
  value: T | null;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex rounded-md border-2 border-ink bg-surface p-1 shadow-hard-xs", className)}
    >
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            "relative min-w-20 cursor-pointer rounded-sm px-4 py-2 text-center font-semibold tracking-tight select-none",
            "transition-colors duration-100 hover:bg-ink/5",
            "has-checked:bg-ink has-checked:text-surface",
            "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink",
          )}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Time field — native picker (great on phones) + quick presets               */
/* -------------------------------------------------------------------------- */

export function TimeField({
  id,
  label,
  value,
  onChange,
  presets,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  presets: string[];
  error?: string;
}) {
  return (
    <div className="space-y-3">
      <label htmlFor={id} className="block font-display text-2xl font-bold leading-tight tracking-tight sm:text-[1.75rem]">
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(controlClasses, "h-16 max-w-56 font-mono text-2xl font-semibold tabular-nums")}
      />
      <div className="flex flex-wrap gap-2" aria-label="Quick picks" role="group">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-pressed={value === p}
            className={cn(
              "rounded-sm border-2 px-2.5 py-1 font-mono text-xs font-semibold tabular-nums transition-colors",
              value === p ? "border-ink bg-ink text-surface" : "border-ink/25 bg-surface hover:border-ink",
            )}
          >
            {formatClock(p)}
          </button>
        ))}
      </div>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Weekday picker                                                             */
/* -------------------------------------------------------------------------- */

export function WeekdayPicker<T extends number>({
  value,
  options,
  onChange,
  label,
  invalid,
}: {
  value: T[];
  options: { value: T; short: string; long: string }[];
  onChange: (days: T[]) => void;
  label: string;
  invalid?: boolean;
}) {
  const groupId = useId();
  const toggle = (d: T) =>
    onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => a - b));
  return (
    <div role="group" aria-labelledby={groupId} className="space-y-1.5">
      <span id={groupId} className="sr-only">
        {label}
      </span>
      <div className="flex gap-1.5">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              aria-label={o.long}
              onClick={() => toggle(o.value)}
              className={cn(
                "grid size-9 place-items-center rounded-sm border-2 font-mono text-sm font-bold transition-[background-color,transform] duration-100 active:scale-95",
                on ? "border-ink bg-ink text-surface" : "bg-surface text-ink",
                !on && (invalid ? "border-destructive" : "border-ink/30 hover:border-ink"),
              )}
            >
              {o.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}

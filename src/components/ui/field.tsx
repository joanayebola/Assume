import { CircleAlert } from "lucide-react";
import { useId, type ComponentProps, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Form controls "lift" when focused (ink hard shadow + nudge) instead of
 * relying on a thin glow — obvious, high-contrast and on-brand.
 */
export const controlClasses =
  "w-full rounded-md border-2 border-ink bg-surface px-4 text-base text-ink " +
  "placeholder:text-muted-foreground/80 " +
  "transition-[transform,box-shadow] duration-100 ease-out " +
  "focus-visible:outline-none focus-visible:-translate-x-0.5 focus-visible:-translate-y-0.5 focus-visible:shadow-hard-md " +
  "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground " +
  "aria-invalid:border-destructive aria-invalid:bg-destructive-soft/40";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cn("block text-sm font-semibold tracking-tight text-ink", className)}
      {...props}
    />
  );
}

type FieldShellProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  labelAside?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function FieldShell({
  id,
  label,
  hint,
  error,
  optional,
  labelAside,
  className,
  children,
}: FieldShellProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>
          {label}
          {optional && <span className="ml-1.5 font-normal text-muted-foreground">(optional)</span>}
        </Label>
        {labelAside}
      </div>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${id}-error`}
          className="flex items-start gap-1.5 text-sm font-medium text-destructive animate-rise"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(id: string, hint?: ReactNode, error?: string) {
  return [error ? `${id}-error` : null, hint && !error ? `${id}-hint` : null]
    .filter(Boolean)
    .join(" ") || undefined;
}

type TextFieldProps = Omit<ComponentProps<"input">, "id"> & {
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  labelAside?: ReactNode;
  containerClassName?: string;
};

export function TextField({
  id: idProp,
  label,
  hint,
  error,
  optional,
  labelAside,
  containerClassName,
  className,
  ...props
}: TextFieldProps) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      labelAside={labelAside}
      className={containerClassName}
    >
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(controlClasses, "h-12", className)}
        {...props}
      />
    </FieldShell>
  );
}

type SelectFieldProps = Omit<ComponentProps<"select">, "id"> & {
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  containerClassName?: string;
};

export function SelectField({
  id: idProp,
  label,
  hint,
  error,
  containerClassName,
  className,
  children,
  ...props
}: SelectFieldProps) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={containerClassName}>
      <div className="relative">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cn(controlClasses, "h-12 appearance-none pr-11", className)}
          {...props}
        >
          {children}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2"
        >
          <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.5" />
        </svg>
      </div>
    </FieldShell>
  );
}

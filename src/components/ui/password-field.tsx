"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type ComponentProps, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { controlClasses, FieldShell } from "./field";

type PasswordFieldProps = Omit<ComponentProps<"input">, "id" | "type"> & {
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  labelAside?: ReactNode;
};

export function PasswordField({
  id: idProp,
  label,
  hint,
  error,
  labelAside,
  className,
  ...props
}: PasswordFieldProps) {
  const generated = useId();
  const id = idProp ?? generated;
  const [visible, setVisible] = useState(false);
  const describedBy =
    [error ? `${id}-error` : null, hint && !error ? `${id}-hint` : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} labelAside={labelAside}>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(controlClasses, "h-12 pr-14", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={id}
          className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-sm text-ink hover:bg-ink/5"
        >
          {visible ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
        </button>
      </div>
    </FieldShell>
  );
}

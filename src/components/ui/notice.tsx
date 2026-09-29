import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "error";

const styles: Record<Tone, { box: string; Icon: typeof Info }> = {
  info: { box: "bg-surface", Icon: Info },
  success: { box: "bg-success-soft", Icon: CircleCheck },
  error: { box: "bg-destructive-soft", Icon: CircleAlert },
};

export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const { box, Icon } = styles[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-md border-2 border-ink p-4 text-sm shadow-hard-xs animate-pop",
        box,
        className,
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}

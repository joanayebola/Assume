import type { ReactNode } from "react";

import { Tag } from "@/components/ui/tag";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <Tag tone="surface">{eyebrow}</Tag>}
        <h1 className="mt-4 text-display-md font-extrabold">{title}</h1>
        {description && <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl px-gutter py-8 sm:px-8 sm:py-12 lg:px-12">{children}</div>;
}

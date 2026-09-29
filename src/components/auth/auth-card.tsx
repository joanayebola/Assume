import type { ReactNode } from "react";

export function AuthHeading({ title, description }: { title: ReactNode; description?: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-display-md font-extrabold">{title}</h1>
      {description && <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  );
}

export function AuthFooter({ children }: { children: ReactNode }) {
  return (
    <p className="mt-8 border-t-2 border-ink pt-6 text-center text-sm text-muted-foreground">{children}</p>
  );
}

import type { ReactNode } from "react";

import { Container } from "@/components/ui/container";

/** Editorial layout for Terms / Privacy, with a clear "needs legal review" banner. */
export function LegalPage({
  eyebrow,
  title,
  updated,
  draft = true,
  children,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  draft?: boolean;
  children: ReactNode;
}) {
  return (
    <Container size="narrow" className="py-14 sm:py-20">
      <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
      <h1 className="mt-4 text-display-lg font-extrabold">{title}</h1>
      <p className="mt-4 font-mono text-sm text-muted-foreground">Last updated {updated}</p>
      {draft && (
        <div role="note" className="mt-8 rounded-md border-2 border-ink bg-accent-soft p-4 text-sm leading-relaxed shadow-hard-xs">
          <p className="font-semibold">Draft — requires legal review before launch.</p>
          <p className="mt-1">
            This page sets out the structure and describes how Assume actually works. Items in [brackets] must be completed, and the whole
            text reviewed by a qualified lawyer for your jurisdiction.
          </p>
        </div>
      )}
      <div className="legal mt-12 space-y-10">{children}</div>
    </Container>
  );
}

export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t-2 border-ink pt-6">
      <h2 id={id} className="font-display text-2xl font-bold tracking-tight">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-[1.05rem] leading-relaxed text-ink-soft [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_strong]:text-ink [&_ul]:space-y-2 [&_a]:font-semibold [&_a]:text-ink [&_a]:underline [&_a]:decoration-2 [&_a]:underline-offset-4">
        {children}
      </div>
    </section>
  );
}

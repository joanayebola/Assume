import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { routes } from "@/lib/site";

/** Minimal header for focused flows (checkout, generation). */
export function FlowHeader({ back }: { back?: { href: string; label: string } }) {
  return (
    <header className="pt-safe border-b-2 border-ink">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-gutter sm:px-6">
        <Logo href={routes.appHome} />
        {back && (
          <Link href={back.href} className="inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-semibold text-muted-foreground hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden />
            {back.label}
          </Link>
        )}
      </div>
    </header>
  );
}

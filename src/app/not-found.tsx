import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-grid">
      <header className="pt-safe flex h-16 items-center border-b-2 border-ink bg-background px-gutter sm:px-8">
        <Logo />
      </header>
      <main id="main" className="grid flex-1 place-items-center px-gutter py-16">
        <div className="w-full max-w-lg text-center animate-rise">
          <div className="relative mx-auto inline-block">
            <p
              aria-hidden
              className="font-display text-[9rem] font-extrabold leading-none tracking-tighter text-accent [-webkit-text-stroke:3px_var(--ink)] sm:text-[12rem]"
            >
              404
            </p>
            <Tag tone="ink" sticker tilt="right" className="absolute -right-2 top-4">
              Off schedule
            </Tag>
          </div>
          <h1 className="mt-4 text-display-sm font-extrabold">This page doesn&apos;t exist.</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            The link may be old, or the address has a typo. Nothing else is affected.
          </p>
          <div className="mt-8 flex justify-center">
            <ButtonLink href="/" size="lg" iconLeft={<ArrowLeft aria-hidden />}>
              Back to Assume
            </ButtonLink>
          </div>
        </div>
      </main>
    </div>
  );
}

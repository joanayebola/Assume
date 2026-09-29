import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { RoutineTimeline } from "@/components/routine/routine-timeline";
import { heroRoutine } from "@/content/landing";
import { site } from "@/lib/site";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh flex-1 lg:grid-cols-[1fr_minmax(0,0.9fr)]">
      <div className="flex flex-col">
        <header className="pt-safe flex h-16 items-center justify-between border-b-2 border-ink px-gutter sm:px-6 lg:border-b-0 lg:px-10">
          <Logo />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold hover:underline hover:decoration-2 underline-offset-4"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to site
          </Link>
        </header>
        <main id="main" className="flex flex-1 items-start justify-center px-gutter py-10 sm:px-6 sm:py-16 lg:items-center">
          <div className="w-full max-w-md animate-rise">{children}</div>
        </main>
      </div>

      {/* Brand panel — desktop only */}
      <aside
        aria-hidden
        className="relative hidden overflow-hidden border-l-2 border-ink bg-accent lg:flex lg:flex-col lg:justify-between lg:p-12"
      >
        <p className="font-display text-display-md font-extrabold">{site.tagline}</p>
        <div className="relative mx-auto w-full max-w-sm">
          <div className="rounded-xl border-2 border-ink bg-background p-4 shadow-hard-lg">
            <RoutineTimeline items={heroRoutine.slice(0, 4)} compact />
          </div>
        </div>
        <p className="max-w-sm text-sm">
          Your routine is built from your answers — your schedule, your methods, your pace.
        </p>
      </aside>
    </div>
  );
}

import { ArrowDown, ArrowRight } from "lucide-react";

import { RoutineTimeline } from "@/components/routine/routine-timeline";
import { ButtonLink } from "@/components/ui/button";

import { CtaLink } from "./cta-link";
import { Container } from "@/components/ui/container";
import { Tag } from "@/components/ui/tag";
import { heroRoutine } from "@/content/landing";
import { routes } from "@/lib/site";

export function Hero() {
  const total = heroRoutine.reduce((sum, i) => sum + (i.kind === "practice" ? i.minutes : 0), 0);

  return (
    <section aria-labelledby="hero-title" className="border-b-2 border-ink">
      <Container
        size="wide"
        className="grid items-center gap-16 py-16 sm:py-24 lg:grid-cols-[1.2fr_0.8fr] lg:gap-20 lg:py-32"
      >
        <div className="animate-rise">
          <h1 id="hero-title" className="text-display-xl font-extrabold">
            Manifestation that fits your{" "}
            <span className="relative isolate inline-block whitespace-nowrap">
              <span
                aria-hidden
                className="absolute inset-x-[-0.08em] bottom-[0.06em] top-[0.52em] -z-10 -rotate-1 bg-accent"
              />
              actual life.
            </span>
          </h1>
          <p className="mt-8 max-w-lg text-lg leading-relaxed text-ink-soft sm:text-xl">
            Tell Assume what you want, how you like to manifest and what your days actually look like.
            Get a practice built around your life.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <CtaLink location="hero" href={routes.signup} size="lg" iconRight={<ArrowRight aria-hidden />}>
              Build my routine
            </CtaLink>
            <ButtonLink href="#how-it-works" size="lg" variant="ghost" iconRight={<ArrowDown aria-hidden />}>
              See how it works
            </ButtonLink>
          </div>
        </div>

        {/* Product preview: an example day, not a real user */}
        <figure
          aria-label="Example routine"
          className="relative mx-auto w-full max-w-sm animate-rise [animation-delay:120ms] lg:mr-0"
        >
          <Tag tone="accent" sticker tilt="right" className="absolute -top-3 right-5 z-10">
            Example
          </Tag>
          <div className="rounded-xl border-2 border-ink bg-surface p-5 shadow-hard-lg">
            <div className="mb-5 flex items-baseline justify-between">
              <p className="font-display text-xl font-bold tracking-tight">Tuesday</p>
              <p className="font-mono text-xs text-muted-foreground">{total} min</p>
            </div>
            <RoutineTimeline items={heroRoutine} compact />
          </div>
        </figure>
      </Container>
    </section>
  );
}

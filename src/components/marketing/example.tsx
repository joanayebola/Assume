import { Check } from "lucide-react";

import { RoutineTimeline } from "@/components/routine/routine-timeline";
import { Container } from "@/components/ui/container";
import { Tag } from "@/components/ui/tag";
import { exampleInput, exampleReasons, exampleRoutine, exampleSignals } from "@/content/landing";

import { Eyebrow } from "./section-heading";

export function Example() {
  const total = exampleRoutine.reduce((sum, i) => sum + (i.kind === "practice" ? i.minutes : 0), 0);

  return (
    <section
      id="example"
      aria-labelledby="example-title"
      className="scroll-mt-20 border-y-2 border-ink bg-background-deep py-section lg:py-section-lg"
    >
      <Container size="wide">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-24">
          <div>
            <Eyebrow>Example</Eyebrow>
            <h2 id="example-title" className="sr-only">
              How Assume turns one sentence into a routine
            </h2>
            <blockquote className="mt-6 font-display text-display-sm font-bold sm:text-4xl sm:leading-tight">
              &ldquo;{exampleInput}&rdquo;
            </blockquote>
            <ul className="mt-8 flex flex-wrap gap-2" aria-label="What Assume picks up">
              {exampleSignals.map((s, i) => (
                <li key={s}>
                  <Tag tone={i === exampleSignals.length - 1 ? "accent" : "surface"}>{s}</Tag>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border-2 border-ink bg-surface p-5 shadow-hard-lg sm:p-6">
            <div className="mb-5 flex items-baseline justify-between">
              <p className="font-display text-xl font-bold tracking-tight">Your weekdays</p>
              <p className="font-mono text-xs text-muted-foreground">{total} min</p>
            </div>
            <RoutineTimeline items={exampleRoutine} />
          </div>
        </div>

        <ul className="mt-16 grid gap-8 sm:grid-cols-3" aria-label="Why this routine fits">
          {exampleReasons.map((r) => (
            <li key={r.title} className="flex gap-3">
              <Check className="mt-1 size-5 shrink-0" strokeWidth={3} aria-hidden />
              <div>
                <p className="font-semibold tracking-tight">{r.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{r.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

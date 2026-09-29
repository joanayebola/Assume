import { Container } from "@/components/ui/container";
import { steps } from "@/content/landing";

import { SectionHeading } from "./section-heading";

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-20 py-section lg:py-section-lg">
      <Container size="wide">
        <SectionHeading id="how-title" eyebrow="How it works" title="Three answers. One routine that fits." />

        <ol className="mt-16 grid gap-12 md:grid-cols-3 md:gap-10">
          {steps.map((step, i) => (
            <li key={step.title} className="border-t-2 border-ink pt-6">
              <span
                aria-hidden
                className="font-display text-6xl font-extrabold leading-none tracking-tighter text-accent [-webkit-text-stroke:2px_var(--ink)]"
              >
                {i + 1}
              </span>
              <h3 className="mt-6 text-display-sm font-bold">
                <span className="sr-only">Step {i + 1}: </span>
                {step.title}
              </h3>
              <p className="mt-3 max-w-xs leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

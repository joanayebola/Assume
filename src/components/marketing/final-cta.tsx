import { ArrowRight } from "lucide-react";

import { CtaLink } from "./cta-link";
import { Container } from "@/components/ui/container";
import { routes } from "@/lib/site";

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="border-t-2 border-ink bg-accent">
      <Container size="wide" className="py-section lg:py-section-lg">
        <div className="grid items-end gap-10 lg:grid-cols-[1.4fr_1fr]">
          <h2 id="cta-title" className="text-display-lg font-extrabold">
            Stop fitting your life around a routine.
          </h2>
          <div className="space-y-6">
            <p className="text-lg leading-relaxed sm:text-xl">
              Tell Assume about your days and get a practice that fits between them — in the time you
              actually have, with methods you actually like.
            </p>
            <CtaLink
              location="final"
              href={routes.signup}
              size="lg"
              variant="ink"
              iconRight={<ArrowRight aria-hidden />}
              className="w-full sm:w-auto"
            >
              Build my routine
            </CtaLink>
          </div>
        </div>
      </Container>
    </section>
  );
}

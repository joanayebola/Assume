import { CalendarPlus, Clock, RefreshCw, Sparkles } from "lucide-react";

import { Container } from "@/components/ui/container";

import { SectionHeading } from "./section-heading";

const features = [
  {
    icon: Clock,
    title: "Built around your real schedule",
    body: "Sessions go where you genuinely have room — never on top of things you can't move.",
  },
  {
    icon: Sparkles,
    title: "Techniques you actually enjoy",
    body: "Love visualizing, can't stand journaling? Your routine only uses what you'll do.",
  },
  {
    icon: CalendarPlus,
    title: "Straight to your calendar",
    body: "Every session becomes an event, so your practice shows up where your day already lives.",
  },
  {
    icon: RefreshCw,
    title: "Changes when your life does",
    body: "New job, new term, night shifts. Edit a session or rebuild the whole routine.",
  },
];

export function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-20 py-section lg:py-section-lg">
      <Container size="wide">
        <SectionHeading id="features-title" eyebrow="Why Assume" title="Your practice, shaped like your week." />

        <ul className="mt-16 grid gap-x-16 gap-y-12 sm:grid-cols-2">
          {features.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-5">
              <span
                aria-hidden
                className="grid size-11 shrink-0 place-items-center rounded-md border-2 border-ink bg-accent"
              >
                <Icon className="size-5" />
              </span>
              <div>
                <h3 className="text-xl font-bold tracking-tight">{title}</h3>
                <p className="mt-2 max-w-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="on-ink mt-20 rounded-xl border-2 border-ink bg-ink p-8 text-surface sm:p-12">
          <h3 className="text-display-md font-extrabold">No guilt. No streaks.</h3>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-surface/75">
            Missed a session? Nothing is ruined. Assume never counts streaks or suggests a skipped day undoes
            anything. Your routine is just there when you come back.
          </p>
        </div>
      </Container>
    </section>
  );
}

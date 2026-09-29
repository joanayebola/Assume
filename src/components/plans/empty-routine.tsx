import { ArrowRight, Clock, Heart, Target } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { routes } from "@/lib/site";

const asks = [
  { icon: Target, label: "What you're manifesting" },
  { icon: Heart, label: "Methods you love (and hate)" },
  { icon: Clock, label: "What your days look like" },
];

/** A blank day with dashed, empty slots — where their routine will live. */
function BlankDay() {
  const rows = ["Morning", "Commute", "Midday", "Evening", "Bedtime"];
  return (
    <div aria-hidden className="rounded-xl border-2 border-ink bg-background p-4">
      <ol className="space-y-2.5">
        {rows.map((r, i) => (
          <li key={r} className="grid grid-cols-[4.5rem_1fr] items-center gap-3">
            <span className="font-mono text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
              {r}
            </span>
            <span
              className={
                i === 1 || i === 3
                  ? "h-9 rounded-md border-2 border-dashed border-ink/40 bg-hatch"
                  : "h-9 rounded-md border-2 border-dashed border-ink/40"
              }
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

export function EmptyRoutine() {
  return (
    <section
      aria-labelledby="empty-title"
      className="grid gap-10 overflow-hidden rounded-xl border-2 border-ink bg-surface p-6 shadow-hard-lg sm:p-10 md:grid-cols-[1.15fr_0.85fr] md:items-center"
    >
      <div>
        <h2 id="empty-title" className="text-display-md font-extrabold">
          You haven&apos;t built a routine yet.
        </h2>
        <p className="mt-4 text-xl leading-relaxed text-ink-soft">Let&apos;s make manifestation fit your life.</p>

        <ul className="mt-8 space-y-3">
          {asks.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 font-medium">
              <span className="grid size-8 place-items-center rounded-sm border-2 border-ink bg-accent-soft">
                <Icon className="size-4" aria-hidden />
              </span>
              {label}
            </li>
          ))}
        </ul>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
          <ButtonLink href={routes.newPlan} size="lg" iconRight={<ArrowRight aria-hidden />}>
            Create my first plan
          </ButtonLink>
          <p className="text-sm text-muted-foreground">Takes about 5 minutes.</p>
        </div>
      </div>

      <BlankDay />
    </section>
  );
}

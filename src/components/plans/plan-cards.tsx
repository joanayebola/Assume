import { ArrowRight, CalendarCheck2, CalendarClock, CalendarOff, Pause, Sparkles } from "lucide-react";
import Link from "next/link";

import { Tag } from "@/components/ui/tag";
import { routineStyleOptions } from "@/content/intake";
import { dayMonth, whenLabel } from "@/lib/calendar/format";
import type { PlanCard } from "@/lib/data/plans";
import { routes } from "@/lib/site";
import { cn } from "@/lib/utils";

const styleLabel = (s: PlanCard["structure"]) => routineStyleOptions.find((o) => o.value === s)?.label ?? "Custom";

const calendarIcon = { ok: CalendarCheck2, attention: CalendarClock, none: CalendarOff };

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold">{children}</dd>
    </div>
  );
}

export function PlanCardItem({ card, viewerTimeZone, now }: { card: PlanCard; viewerTimeZone: string; now: number }) {
  const finished = card.status === "completed" || card.status === "archived";
  const CalIcon = calendarIcon[card.calendar.tone];
  return (
    <li className="min-w-0">
      <Link
        href={`${routes.plans}/${card.id}`}
        className={cn(
          "group flex h-full flex-col gap-5 rounded-lg border-2 border-ink p-5 transition-[transform,box-shadow] duration-100",
          "hover:-translate-x-px hover:-translate-y-px active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
          finished ? "bg-background shadow-hard-xs hover:shadow-hard-sm" : "bg-surface shadow-hard-sm hover:shadow-hard-md",
          card.status === "paused" && "border-dashed",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {card.status === "paused" && (
                <Tag tone="surface">
                  <Pause aria-hidden /> Paused
                </Tag>
              )}
              {card.status === "completed" && (
                <Tag tone="accent">
                  <Sparkles aria-hidden /> Manifested{card.completedAt ? ` ${dayMonth(card.completedAt, viewerTimeZone)}` : ""}
                </Tag>
              )}
              {card.status === "archived" && <Tag tone="surface">Archived</Tag>}
              <span className="font-mono text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">{styleLabel(card.structure)}</span>
            </div>
            <p className="mt-2 line-clamp-2 text-lg font-bold leading-snug tracking-tight">{card.desire || card.title}</p>
            {card.desire && <p className="mt-1 truncate text-sm text-muted-foreground">{card.title}</p>}
          </div>
          <ArrowRight className="mt-1 size-5 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </div>

        {!finished && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t-2 border-dashed border-ink/15 pt-4">
            <Meta label="Daily">{card.daily}</Meta>
            <Meta label="Next">
              {card.status === "paused" ? (
                "Paused"
              ) : card.next ? (
                <>
                  {whenLabel(card.next.start, viewerTimeZone, now)}
                  <span className="block truncate text-xs font-normal text-muted-foreground">{card.next.title}</span>
                </>
              ) : (
                "Nothing this week"
              )}
            </Meta>
            <div className="col-span-2">
              <dt className="sr-only">Calendar</dt>
              <dd
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-semibold",
                  card.calendar.tone === "attention" ? "bg-accent-soft" : card.calendar.tone === "ok" ? "bg-success-soft" : "bg-background text-muted-foreground",
                )}
              >
                <CalIcon className="size-3.5" aria-hidden />
                {card.calendar.label}
              </dd>
            </div>
          </dl>
        )}
      </Link>
    </li>
  );
}

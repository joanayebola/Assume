import { cn } from "@/lib/utils";

export type TimelineItem =
  | {
      kind: "practice";
      time: string;
      title: string;
      method: string;
      minutes: number;
      note?: string;
      highlight?: boolean;
    }
  | {
      kind: "life";
      time: string;
      title: string;
      duration: string;
    };

/**
 * Vertical day timeline. "life" blocks (work, commute, gym) are hatched so
 * the practice sessions visibly slot *around* the user's real commitments.
 * Presentational only — Phase 2's routine editor will reuse the same visual
 * language with interactive blocks.
 */
export function RoutineTimeline({
  items,
  className,
  compact = false,
}: {
  items: TimelineItem[];
  className?: string;
  compact?: boolean;
}) {
  return (
    <ol className={cn("space-y-2", className)}>
      {items.map((item, i) => (
        <li key={`${item.time}-${i}`} className="relative grid grid-cols-[3.1rem_1fr] items-start gap-3">
          <time className="pt-2.5 text-right font-mono text-xs font-semibold tabular-nums text-muted-foreground">
            {item.time}
          </time>
          {item.kind === "life" ? (
            <div className="flex items-center justify-between gap-2 rounded-md bg-hatch px-3 py-2 text-sm text-muted-foreground">
              <span>{item.title}</span>
              <span className="font-mono text-xs">{item.duration}</span>
            </div>
          ) : (
            <div
              className={cn(
                "rounded-md border-2 border-ink px-3 py-2.5",
                item.highlight ? "bg-accent" : "bg-surface",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold leading-snug tracking-tight">{item.title}</p>
                <span className="shrink-0 font-mono text-xs font-semibold">{item.minutes}m</span>
              </div>
              <p className={cn("mt-0.5 text-xs", item.highlight ? "text-ink" : "text-muted-foreground")}>
                {item.method}
                {item.note && !compact && <span> · {item.note}</span>}
              </p>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

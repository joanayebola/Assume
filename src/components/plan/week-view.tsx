"use client";

import { formatClock } from "@/lib/intake/format";
import type { Weekday } from "@/lib/intake/model";
import type { PlanDoc } from "@/lib/plan/schema";
import { toMinutes } from "@/lib/plan/time";
import { dayMinutes, sessionsOn, techniqueLabel, toneClasses, toneOf, WEEK } from "@/lib/plan/view";
import { cn } from "@/lib/utils";

/** Seven day buttons with each day's practice minutes. */
export function DayStrip({
  doc,
  selected,
  today,
  onSelect,
}: {
  doc: PlanDoc;
  selected: Weekday;
  today: Weekday;
  onSelect: (day: Weekday) => void;
}) {
  const minutes = dayMinutes(doc);
  const max = Math.max(1, ...Object.values(minutes));
  return (
    <div role="tablist" aria-label="Day of the week" className="grid grid-cols-7 gap-1.5">
      {WEEK.map(({ day, short, long }) => {
        const on = day === selected;
        return (
          <button
            key={day}
            role="tab"
            type="button"
            aria-selected={on}
            aria-label={`${long}, ${minutes[day]} minutes${day === today ? ", today" : ""}`}
            onClick={() => onSelect(day)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-md border-2 px-1 py-2 transition-colors",
              on ? "border-ink bg-ink text-surface shadow-hard-xs" : "border-ink/20 bg-surface hover:border-ink",
            )}
          >
            <span className="text-xs font-bold">{short}</span>
            <span aria-hidden className="flex h-8 w-2.5 items-end rounded-full bg-ink/10">
              <span
                className={cn("w-full rounded-full", on ? "bg-accent" : "bg-ink")}
                style={{ height: `${Math.max(minutes[day] ? 12 : 0, (minutes[day] / max) * 100)}%` }}
              />
            </span>
            <span className={cn("font-mono text-[0.65rem]", on ? "text-surface/80" : "text-muted-foreground")}>{minutes[day]}m</span>
            {day === today && <span aria-hidden className={cn("size-1.5 rounded-full", on ? "bg-accent" : "bg-accent-ink")} />}
          </button>
        );
      })}
    </div>
  );
}

const HOUR_PX = 30;

/** Desktop calendar: sessions positioned by real time across the week. */
export function WeekGrid({
  doc,
  today,
  selected,
  onSelect,
}: {
  doc: PlanDoc;
  today: Weekday;
  selected: Weekday;
  onSelect: (day: Weekday, sessionId?: string) => void;
}) {
  if (!doc.sessions.length) return null;
  const starts = doc.sessions.map((s) => toMinutes(s.startTime));
  const ends = doc.sessions.map((s) => toMinutes(s.startTime) + s.durationMinutes);
  // Pad by an hour at the end so late sessions (bedtime SATS) are never clipped.
  let from = Math.max(0, Math.floor(Math.min(...starts) / 60));
  let to = Math.min(24, Math.ceil(Math.max(...ends) / 60) + 1);
  if (to - from < 6) to = Math.min(24, from + 6);
  if (to - from > 18) {
    from = 0;
    to = 24;
  }
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const height = (to - from) * HOUR_PX;

  return (
    <div className="overflow-hidden rounded-lg border-2 border-ink bg-surface" aria-label="Week at a glance">
      <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b-2 border-ink">
        <span />
        {WEEK.map(({ day, short }) => (
          <button
            key={day}
            type="button"
            onClick={() => onSelect(day)}
            aria-pressed={day === selected}
            className={cn(
              "border-l-2 border-ink/10 py-2 text-center text-sm font-bold transition-colors",
              day === selected ? "bg-ink text-surface" : "hover:bg-background",
            )}
          >
            {short}
            {day === today && <span className="ml-1 font-mono text-[0.6rem] font-semibold uppercase text-accent-ink">today</span>}
          </button>
        ))}
      </div>
      <div className="relative grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]" style={{ height }}>
        <div className="relative">
          {hours.slice(0, -1).map((h) => (
            <span
              key={h}
              className="absolute right-2 -translate-y-1/2 font-mono text-[0.65rem] text-muted-foreground"
              style={{ top: (h - from) * HOUR_PX }}
            >
              {h === from ? "" : formatClock(`${String(h % 24).padStart(2, "0")}:00`)}
            </span>
          ))}
        </div>
        {WEEK.map(({ day }) => (
          <div key={day} className={cn("relative border-l-2 border-ink/10", day === today && "bg-accent-soft/35")}>
            {hours.slice(1, -1).map((h) => (
              <span key={h} aria-hidden className="absolute inset-x-0 border-t border-ink/8" style={{ top: (h - from) * HOUR_PX }} />
            ))}
            {sessionsOn(doc, day).map((s) => {
              const top = ((toMinutes(s.startTime) - from * 60) / 60) * HOUR_PX;
              const h = Math.max(20, (s.durationMinutes / 60) * HOUR_PX);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelect(day, s.id)}
                  title={`${formatClock(s.startTime)} · ${s.title}`}
                  className={cn(
                    "absolute inset-x-1 overflow-hidden rounded-sm border-2 px-1 text-left text-[0.68rem] font-semibold leading-tight transition-transform hover:z-10 hover:-translate-y-px hover:shadow-hard-xs",
                    toneClasses[toneOf(s.technique)],
                    s.optional && "border-dashed opacity-80",
                  )}
                  style={{ top, height: h }}
                >
                  <span className="sr-only">
                    {WEEK[day - 1].long} {formatClock(s.startTime)}, {s.durationMinutes} minutes, {techniqueLabel(s)}:{" "}
                  </span>
                  <span aria-hidden className="block truncate">
                    {s.title}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

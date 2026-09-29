"use client";

import { Pencil } from "lucide-react";
import type { ReactNode } from "react";

import { stepMeta } from "@/content/intake";
import {
  formatClock,
  formatCommitment,
  formatDate,
  formatOverlap,
  formatStyle,
  formatTimeBudget,
  techniqueLabel,
} from "@/lib/intake/format";
import type { IntakeSections, SectionKey } from "@/lib/intake/model";

function Row({
  title,
  step,
  onEdit,
  children,
  empty = "Not added",
}: {
  title: string;
  step: SectionKey;
  onEdit: (step: SectionKey) => void;
  children?: ReactNode;
  empty?: string;
}) {
  const hasContent = Boolean(children) && !(Array.isArray(children) && children.length === 0);
  return (
    <div className="grid gap-2 py-5 sm:grid-cols-[11rem_1fr_auto] sm:gap-6">
      <dt className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:pt-1">
        {title}
      </dt>
      <dd className="min-w-0 leading-relaxed break-words">
        {hasContent ? children : <span className="text-muted-foreground">{empty}</span>}
      </dd>
      <dd className="sm:text-right">
        <button
          type="button"
          onClick={() => onEdit(step)}
          className="inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-accent-ink underline decoration-2 underline-offset-4 hover:text-ink"
        >
          <Pencil className="size-3.5" aria-hidden />
          Edit<span className="sr-only"> {title.toLowerCase()}</span>
        </button>
      </dd>
    </div>
  );
}

function Chips({ items, tone = "surface" }: { items: string[]; tone?: "surface" | "accent" | "muted" }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <li
          key={t}
          className={
            tone === "accent"
              ? "rounded-sm border-2 border-ink bg-accent px-2 py-0.5 text-sm font-semibold"
              : tone === "muted"
                ? "rounded-sm border-2 border-ink/20 px-2 py-0.5 text-sm text-muted-foreground line-through decoration-2"
                : "rounded-sm border-2 border-ink bg-surface px-2 py-0.5 text-sm font-semibold"
          }
        >
          {t}
        </li>
      ))}
    </ul>
  );
}

export function ReviewStep({
  sections: s,
  onEdit,
  timezone,
}: {
  sections: IntakeSections;
  onEdit: (step: SectionKey) => void;
  timezone: string;
}) {
  const label = (t: Parameters<typeof techniqueLabel>[0]) => techniqueLabel(t, s.methods.otherLabel);
  const love = s.methods.preferences.filter((p) => p.preference === "love").map((p) => label(p.technique));
  const fine = s.methods.preferences.filter((p) => p.preference === "fine").map((p) => label(p.technique));
  const avoid = s.methods.preferences.filter((p) => p.preference === "avoid").map((p) => label(p.technique));
  const affirmations = s.affirmations.items.map((i) => i.text.trim()).filter(Boolean);

  return (
    <div className="space-y-10">
      <section aria-labelledby="review-desire" className="rounded-xl border-2 border-ink bg-accent p-6 shadow-hard-md sm:p-8">
        <h2 id="review-desire" className="font-mono text-xs font-semibold uppercase tracking-wider">
          My manifestation
        </h2>
        <p className="mt-3 font-display text-display-sm font-bold break-words">{s.desire.desire}</p>
        <button
          type="button"
          onClick={() => onEdit("desire")}
          className="mt-4 inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold underline decoration-2 underline-offset-4"
        >
          <Pencil className="size-3.5" aria-hidden />
          Edit<span className="sr-only"> my manifestation</span>
        </button>
      </section>

      <dl className="divide-y-2 divide-ink/10 border-t-2 border-ink">
        <Row title="My desired end" step="desire" onEdit={onEdit}>
          {s.desire.desiredEnd.trim() && <p className="whitespace-pre-line">{s.desire.desiredEnd.trim()}</p>}
        </Row>
        <Row title="Circumstances" step="desire" onEdit={onEdit} empty="None added">
          {s.desire.circumstances.trim() && <p className="whitespace-pre-line">{s.desire.circumstances.trim()}</p>}
        </Row>
        <Row title="Affirmations" step="affirmations" onEdit={onEdit}>
          {s.affirmations.mode === "own" && affirmations.length > 0 && (
            <ol className="list-decimal space-y-1 pl-5">
              {affirmations.map((a, i) => (
                <li key={`${i}-${a}`}>{a}</li>
              ))}
            </ol>
          )}
          {s.affirmations.mode === "generate" && <p>Write some for me when my routine is built.</p>}
          {s.affirmations.mode === "none" && <p>No affirmations in my routine.</p>}
        </Row>
        <Row title="Preferred methods" step="methods" onEdit={onEdit} empty="No preference">
          {(love.length > 0 || fine.length > 0 || s.methods.unsure) && (
            <div className="space-y-2">
              {s.methods.unsure && <p>Suggest what fits my day.</p>}
              {love.length > 0 && <Chips items={love} tone="accent" />}
              {fine.length > 0 && <Chips items={fine} />}
            </div>
          )}
        </Row>
        <Row title="Avoid" step="methods" onEdit={onEdit} empty="Nothing to avoid">
          {avoid.length > 0 && <Chips items={avoid} tone="muted" />}
        </Row>
        <Row title="My day" step="day" onEdit={onEdit}>
          <div className="space-y-2">
            <p className="font-semibold">
              Up at {formatClock(s.day.wakeTime)} · Asleep by {formatClock(s.day.sleepTime)}
            </p>
            {s.day.typicalDay.trim() && <p className="whitespace-pre-line">{s.day.typicalDay.trim()}</p>}
            {s.day.commitments.length > 0 && (
              <ul className="space-y-2 text-sm">
                {s.day.commitments.map((c) => (
                  <li key={c.id}>
                    <span className="font-semibold">{formatCommitment(c)}</span>
                    <span className="block text-muted-foreground">{formatOverlap(c)}</span>
                  </li>
                ))}
              </ul>
            )}
            {s.day.weekendsDifferent && s.day.weekendDescription.trim() && (
              <p className="text-sm">
                <span className="font-semibold">Weekends: </span>
                {s.day.weekendDescription.trim()}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Times are in {timezone.replaceAll("_", " ")}. You can change this in Settings.
            </p>
          </div>
        </Row>
        <Row title="Time commitment" step="intensity" onEdit={onEdit}>
          {formatTimeBudget(s.intensity)}
        </Row>
        <Row title="Routine style" step="intensity" onEdit={onEdit}>
          <div className="space-y-1">
            <p>{formatStyle(s.intensity)}</p>
            {s.intensity.quietTimes.trim() && (
              <p className="text-sm">
                <span className="font-semibold">No reminders: </span>
                {s.intensity.quietTimes.trim()}
              </p>
            )}
          </div>
        </Row>
        <Row title="Relevant date" step="context" onEdit={onEdit} empty="No date">
          {s.context.hasRelevantDate && s.context.relevantDate && formatDate(s.context.relevantDate)}
        </Row>
        <Row title="Additional notes" step="context" onEdit={onEdit} empty="None">
          {s.context.notes.trim() && <p className="whitespace-pre-line">{s.context.notes.trim()}</p>}
        </Row>
      </dl>
      <p className="sr-only">{stepMeta.review.summary}</p>
    </div>
  );
}

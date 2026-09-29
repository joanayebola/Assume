"use client";

import { Check, Plus, X } from "lucide-react";

import { controlClasses } from "@/components/ui/field";
import {
  commitmentKinds,
  overlapDefaults,
  overlapOptions,
  techniqueInfo,
  typicalDayExample,
  weekdays,
} from "@/content/intake";
import {
  COMMITMENT_KINDS,
  OVERLAP_TECHNIQUES,
  type Commitment,
  type CommitmentKind,
  type OverlapTechnique,
} from "@/lib/intake/model";
import { cn } from "@/lib/utils";

import { AutoTextarea, FieldError, Question, Segmented, TimeField, WeekdayPicker } from "../controls";
import type { StepProps } from "./types";

const WAKE_PRESETS = ["05:30", "06:00", "06:30", "07:00", "07:30", "08:00", "09:00"];
const SLEEP_PRESETS = ["21:30", "22:00", "22:30", "23:00", "23:30", "00:00", "01:00"];

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `c-${Date.now()}-${Math.random()}`;

function CommitmentCard({
  item,
  index,
  onChange,
  onRemove,
  issues,
}: {
  item: Commitment;
  index: number;
  onChange: (c: Commitment) => void;
  onRemove: () => void;
  issues: Record<string, string>;
}) {
  const labelErr = issues[`commitments.${index}.label`];
  const daysErr = issues[`commitments.${index}.weekdays`];
  const base = `commitment-${item.id}`;

  return (
    <li className="animate-rise rounded-lg border-2 border-ink bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-xs bg-ink px-1.5 py-0.5 font-mono text-[0.68rem] font-semibold uppercase tracking-wider text-surface">
          {commitmentKinds[item.kind].label}
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.label || commitmentKinds[item.kind].label}`}
          className="-mr-1 -mt-1 grid size-9 place-items-center rounded-sm text-muted-foreground hover:bg-destructive-soft hover:text-ink"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="mt-3 grid gap-4">
        <div>
          <label htmlFor={`${base}-label`} className="text-sm font-semibold">
            Label
          </label>
          <input
            id={`${base}-label`}
            value={item.label}
            onChange={(e) => onChange({ ...item, label: e.target.value })}
            maxLength={80}
            enterKeyHint="done"
            aria-invalid={labelErr ? true : undefined}
            aria-describedby={labelErr ? `${base}-label-error` : undefined}
            className={cn(controlClasses, "mt-1.5 h-11")}
          />
          <FieldError id={`${base}-label-error`} message={labelErr} />
        </div>

        <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-end">
          <div>
            <p className="mb-1.5 text-sm font-semibold" aria-hidden>
              Days
            </p>
            <WeekdayPicker
              label={`Days for ${item.label || commitmentKinds[item.kind].label}`}
              value={item.weekdays}
              options={weekdays}
              invalid={Boolean(daysErr)}
              onChange={(d) => onChange({ ...item, weekdays: d })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${base}-start`} className="text-sm font-semibold">
                From
              </label>
              <input
                id={`${base}-start`}
                type="time"
                value={item.start}
                onChange={(e) => onChange({ ...item, start: e.target.value })}
                className={cn(controlClasses, "mt-1.5 h-11 px-3 font-mono tabular-nums")}
              />
            </div>
            <div>
              <label htmlFor={`${base}-end`} className="text-sm font-semibold">
                Until
              </label>
              <input
                id={`${base}-end`}
                type="time"
                value={item.end}
                onChange={(e) => onChange({ ...item, end: e.target.value })}
                className={cn(controlClasses, "mt-1.5 h-11 px-3 font-mono tabular-nums")}
              />
            </div>
          </div>
        </div>
        <FieldError id={`${base}-days-error`} message={daysErr} />

        <OverlapQuestion item={item} index={index} onChange={onChange} issues={issues} />
      </div>
    </li>
  );
}

/** "Could you comfortably manifest during this time?" — activities are context, not blocked time. */
function OverlapQuestion({
  item,
  index,
  onChange,
  issues,
}: {
  item: Commitment;
  index: number;
  onChange: (c: Commitment) => void;
  issues: Record<string, string>;
}) {
  const base = `commitment-${item.id}`;
  const overlapErr = issues[`commitments.${index}.overlap`];
  const techErr = issues[`commitments.${index}.overlapTechniques`];
  const hint = overlapDefaults[item.kind].hint;
  const toggle = (t: OverlapTechnique) =>
    onChange({
      ...item,
      overlapTechniques: item.overlapTechniques.includes(t)
        ? item.overlapTechniques.filter((x) => x !== t)
        : OVERLAP_TECHNIQUES.filter((x) => x === t || item.overlapTechniques.includes(x)),
    });

  return (
    <fieldset className="space-y-3 border-t-2 border-dashed border-ink/20 pt-4" aria-describedby={hint ? `${base}-overlap-hint` : undefined}>
      <legend className="float-left mb-2 w-full font-semibold tracking-tight">
        Could you comfortably manifest during this time?
      </legend>
      {hint && (
        <p id={`${base}-overlap-hint`} className="clear-left text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      <Segmented
        name={`${base}-overlap`}
        value={item.overlap}
        onChange={(overlap) => onChange({ ...item, overlap })}
        options={overlapOptions}
        className="clear-left flex w-full sm:inline-flex sm:w-auto [&>label]:min-w-0 [&>label]:flex-auto [&>label]:whitespace-nowrap [&>label]:px-3 sm:[&>label]:px-4"
      />
      <FieldError id={`${base}-overlap-error`} message={overlapErr} />

      {item.overlap === "some" && (
        <div className="animate-rise space-y-2.5">
          <p id={`${base}-tech-label`} className="text-sm font-semibold">
            What would work during this time?
          </p>
          <div role="group" aria-labelledby={`${base}-tech-label`} className="flex flex-wrap gap-1.5">
            {OVERLAP_TECHNIQUES.map((t) => {
              const on = item.overlapTechniques.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(t)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-sm border-2 px-2.5 py-1.5 text-sm font-semibold transition-[background-color,transform] duration-100 active:scale-[0.97]",
                    on ? "border-ink bg-accent" : techErr ? "border-destructive bg-surface" : "border-ink/25 bg-surface hover:border-ink",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-4 place-items-center rounded-xs border-2 border-ink",
                      on ? "bg-ink text-accent" : "bg-background",
                    )}
                  >
                    {on && <Check className="size-2.5" strokeWidth={4} />}
                  </span>
                  {techniqueInfo[t].label}
                </button>
              );
            })}
          </div>
          {item.overlapTechniques.includes("other") && (
            <div className="animate-rise">
              <label htmlFor={`${base}-other`} className="sr-only">
                What else would work?
              </label>
              <input
                id={`${base}-other`}
                value={item.overlapOtherLabel}
                onChange={(e) => onChange({ ...item, overlapOtherLabel: e.target.value })}
                maxLength={80}
                placeholder="What else would work?"
                enterKeyHint="done"
                className={cn(controlClasses, "h-11")}
              />
            </div>
          )}
          <FieldError id={`${base}-tech-error`} message={techErr} />
        </div>
      )}
    </fieldset>
  );
}

export function DayStep({ value, onChange, issues }: StepProps<"day">) {
  const set = (patch: Partial<typeof value>) => onChange({ ...value, ...patch });

  const addCommitment = (kind: CommitmentKind) =>
    set({
      commitments: [
        ...value.commitments,
        {
          id: newId(),
          kind,
          label: commitmentKinds[kind].label,
          weekdays: [...commitmentKinds[kind].defaultDays],
          start: "",
          end: "",
          overlap: overlapDefaults[kind].overlap,
          overlapTechniques: [...overlapDefaults[kind].techniques],
          overlapOtherLabel: "",
        },
      ],
    });

  return (
    <div className="space-y-14">
      <div className="grid gap-10 sm:grid-cols-2 sm:gap-8">
        <TimeField
          id="wakeTime"
          label="What time do you usually wake up?"
          value={value.wakeTime}
          onChange={(wakeTime) => set({ wakeTime })}
          presets={WAKE_PRESETS}
          error={issues.wakeTime}
        />
        <TimeField
          id="sleepTime"
          label="What time do you usually go to sleep?"
          value={value.sleepTime}
          onChange={(sleepTime) => set({ sleepTime })}
          presets={SLEEP_PRESETS}
          error={issues.sleepTime}
        />
      </div>

      <Question
        id="typicalDay"
        title="What does a normal day look like?"
        helper="Write it like you'd tell a friend. Rough times are perfect — no need to account for every hour."
        error={issues.typicalDay}
      >
        <AutoTextarea
          id="typicalDay"
          value={value.typicalDay}
          onChange={(e) => set({ typicalDay: e.target.value })}
          minRows={4}
          maxLength={4000}
          placeholder={typicalDayExample}
          autoCapitalize="sentences"
          invalid={Boolean(issues.typicalDay)}
          aria-describedby={issues.typicalDay ? "typicalDay-error" : "typicalDay-hint"}
        />
      </Question>

      <Question
        id="commitments"
        as="fieldset"
        title="What does your day usually look like?"
        optional
        helper="Add the things that regularly take up your day. This helps us find the moments where different manifestation methods can naturally fit."
      >
        {value.commitments.length > 0 && (
          <ul className="space-y-3">
            {value.commitments.map((c, i) => (
              <CommitmentCard
                key={c.id}
                item={c}
                index={i}
                issues={issues}
                onChange={(next) =>
                  set({ commitments: value.commitments.map((x) => (x.id === c.id ? next : x)) })
                }
                onRemove={() => set({ commitments: value.commitments.filter((x) => x.id !== c.id) })}
              />
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          {COMMITMENT_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => addCommitment(kind)}
              disabled={value.commitments.length >= 20}
              className="inline-flex items-center gap-1.5 rounded-sm border-2 border-ink bg-surface px-3 py-1.5 text-sm font-semibold shadow-hard-xs transition-[transform,box-shadow] duration-100 hover:-translate-y-px hover:shadow-hard-sm active:translate-y-0.5 active:shadow-none disabled:opacity-50"
            >
              <Plus className="size-3.5" strokeWidth={3} aria-hidden />
              {commitmentKinds[kind].label}
            </button>
          ))}
        </div>
      </Question>

      <Question
        id="weekendsDifferent"
        as="fieldset"
        title="Are your weekends substantially different?"
        error={issues.weekendsDifferent}
      >
        <Segmented
          name="weekends-different"
          value={value.weekendsDifferent === null ? null : value.weekendsDifferent ? "yes" : "no"}
          onChange={(v) => set({ weekendsDifferent: v === "yes" })}
          options={[
            { value: "no", label: "No" },
            { value: "yes", label: "Yes" },
          ]}
        />
        {value.weekendsDifferent && (
          <div className="animate-rise space-y-2">
            <label htmlFor="weekendDescription" className="font-semibold">
              What do your weekends look like?
            </label>
            <AutoTextarea
              id="weekendDescription"
              value={value.weekendDescription}
              onChange={(e) => set({ weekendDescription: e.target.value })}
              maxLength={2000}
              placeholder="e.g. Lie in until 9, brunch with friends on Saturdays, Sundays are slow."
              autoCapitalize="sentences"
              invalid={Boolean(issues.weekendDescription)}
              aria-describedby={issues.weekendDescription ? "weekendDescription-error" : undefined}
            />
            <FieldError id="weekendDescription-error" message={issues.weekendDescription} />
          </div>
        )}
      </Question>
    </div>
  );
}

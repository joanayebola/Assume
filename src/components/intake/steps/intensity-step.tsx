"use client";

import { controlClasses } from "@/components/ui/field";
import { routineStyleOptions, timeBudgetOptions } from "@/content/intake";
import { cn } from "@/lib/utils";

import { AutoTextarea, ChoiceCard, FieldError, Question } from "../controls";
import type { StepProps } from "./types";

export function IntensityStep({ value, onChange, issues }: StepProps<"intensity">) {
  const set = (patch: Partial<typeof value>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-14">
      <Question
        id="timeBudget"
        as="fieldset"
        title="How much time do you actually want to spend on manifestation?"
        helper="Per day, in total. Be honest — a routine you'll keep beats an ambitious one you won't."
        error={issues.timeBudget}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {timeBudgetOptions.map((o) => (
            <ChoiceCard
              key={o.value}
              size="sm"
              name="time-budget"
              value={o.value}
              checked={value.timeBudget === o.value}
              onChange={() => set({ timeBudget: o.value })}
              label={o.label}
            />
          ))}
        </div>
        {value.timeBudget === "custom" && (
          <div className="animate-rise">
            <label htmlFor="customMinutes" className="font-semibold">
              Minutes per day
            </label>
            <div className="mt-2 flex items-center gap-3">
              <input
                id="customMinutes"
                type="number"
                inputMode="numeric"
                min={1}
                max={600}
                value={value.customMinutes ?? ""}
                onChange={(e) => {
                  const n = e.target.value === "" ? null : Math.round(Number(e.target.value));
                  set({ customMinutes: n === null || Number.isNaN(n) ? null : Math.min(600, Math.max(1, n)) });
                }}
                aria-invalid={issues.customMinutes ? true : undefined}
                aria-describedby={issues.customMinutes ? "customMinutes-error" : undefined}
                className={cn(controlClasses, "h-14 w-32 font-mono text-xl font-semibold tabular-nums")}
              />
              <span className="text-muted-foreground">minutes</span>
            </div>
            <FieldError id="customMinutes-error" message={issues.customMinutes} />
          </div>
        )}
      </Question>

      <Question id="style" as="fieldset" title="How structured do you want your routine?" error={issues.style}>
        <div className="grid gap-3">
          {routineStyleOptions.map((o) => (
            <ChoiceCard
              key={o.value}
              name="routine-style"
              value={o.value}
              checked={value.style === o.value}
              onChange={() => set({ style: o.value })}
              label={o.label}
              description={o.description}
            />
          ))}
        </div>
        {value.style === "custom" && (
          <div className="animate-rise space-y-2">
            <label htmlFor="styleNote" className="font-semibold">
              What do you have in mind?
            </label>
            <AutoTextarea
              id="styleNote"
              value={value.styleNote}
              onChange={(e) => set({ styleNote: e.target.value })}
              maxLength={1000}
              placeholder="e.g. One longer session on weekday mornings, nothing on weekends."
              autoCapitalize="sentences"
              invalid={Boolean(issues.styleNote)}
              aria-describedby={issues.styleNote ? "styleNote-error" : undefined}
            />
            <FieldError id="styleNote-error" message={issues.styleNote} />
          </div>
        )}
      </Question>

      <Question
        id="quietTimes"
        title="Are there times you absolutely don't want manifestation reminders?"
        optional
        helper="We'll keep these clear."
        error={issues.quietTimes}
      >
        <AutoTextarea
          id="quietTimes"
          value={value.quietTimes}
          onChange={(e) => set({ quietTimes: e.target.value })}
          minRows={2}
          maxLength={1000}
          placeholder="e.g. During work meetings, after 10pm, while I'm with my kids."
          autoCapitalize="sentences"
          aria-describedby="quietTimes-hint"
        />
      </Question>
    </div>
  );
}

"use client";

import { controlClasses } from "@/components/ui/field";
import { cn } from "@/lib/utils";

import { AutoTextarea, FieldError, Question, Segmented } from "../controls";
import type { StepProps } from "./types";

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function ContextStep({ value, onChange, issues }: StepProps<"context">) {
  const set = (patch: Partial<typeof value>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-14">
      <Question
        id="hasRelevantDate"
        as="fieldset"
        title="Is there a date that's relevant to this desire?"
        helper="An interview, a move, an anniversary, a results day. We only use it to shape the pace of your routine — it isn't a countdown or a promise."
        error={issues.hasRelevantDate}
      >
        <Segmented
          name="has-relevant-date"
          value={value.hasRelevantDate === null ? null : value.hasRelevantDate ? "yes" : "no"}
          onChange={(v) => set({ hasRelevantDate: v === "yes" })}
          options={[
            { value: "no", label: "No" },
            { value: "yes", label: "Yes" },
          ]}
        />
        {value.hasRelevantDate && (
          <div className="animate-rise">
            <label htmlFor="relevantDate" className="font-semibold">
              Which date?
            </label>
            <input
              id="relevantDate"
              type="date"
              min={todayISO()}
              value={value.relevantDate}
              onChange={(e) => set({ relevantDate: e.target.value })}
              aria-invalid={issues.relevantDate ? true : undefined}
              aria-describedby={issues.relevantDate ? "relevantDate-error" : undefined}
              className={cn(controlClasses, "mt-2 h-14 max-w-64 font-mono text-lg font-semibold")}
            />
            <FieldError id="relevantDate-error" message={issues.relevantDate} />
          </div>
        )}
      </Question>

      <Question
        id="notes"
        title="Anything else we should know before building your routine?"
        optional
        helper="Health, energy, a season of life, a method you want to try — anything that should shape it."
        error={issues.notes}
      >
        <AutoTextarea
          id="notes"
          value={value.notes}
          onChange={(e) => set({ notes: e.target.value })}
          maxLength={4000}
          placeholder="Nothing else? You're ready."
          autoCapitalize="sentences"
          aria-describedby="notes-hint"
        />
      </Question>
    </div>
  );
}

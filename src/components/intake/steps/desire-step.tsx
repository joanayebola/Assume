"use client";

import { desireExamples } from "@/content/intake";

import { AutoTextarea, Question } from "../controls";
import type { StepProps } from "./types";

export function DesireStep({ value, onChange, issues }: StepProps<"desire">) {
  const set = (patch: Partial<typeof value>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-14">
      <Question id="desire" title="What are you manifesting?" error={issues.desire}>
        <AutoTextarea
          id="desire"
          value={value.desire}
          onChange={(e) => set({ desire: e.target.value })}
          minRows={2}
          maxLength={1000}
          placeholder="In your own words…"
          autoCapitalize="sentences"
          enterKeyHint="next"
          invalid={Boolean(issues.desire)}
          aria-describedby={issues.desire ? "desire-error" : "desire-examples"}
          className="text-xl font-medium sm:text-2xl"
        />
        <div id="desire-examples">
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            For example
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {desireExamples.map((ex) => (
              <li
                key={ex}
                className="rounded-sm border-2 border-ink/15 bg-surface px-2.5 py-1 text-sm text-muted-foreground"
              >
                {ex}
              </li>
            ))}
          </ul>
        </div>
      </Question>

      <Question
        id="desiredEnd"
        title="What does having it actually look like to you?"
        optional
        helper="Describe the moment it's real — not the steps to get there. This helps us tell the desire apart from the in-between steps."
        error={issues.desiredEnd}
      >
        <AutoTextarea
          id="desiredEnd"
          value={value.desiredEnd}
          onChange={(e) => set({ desiredEnd: e.target.value })}
          maxLength={4000}
          placeholder="e.g. Waking up in my own place, light coming through the big window, coffee on the balcony…"
          autoCapitalize="sentences"
          aria-describedby="desiredEnd-hint"
        />
      </Question>

      <Question
        id="circumstances"
        title="Are there any circumstances you want us to know about?"
        optional
        helper="Distance, a deadline, current circumstances, something that's been making the desire feel complicated, etc. Leaving this blank is completely fine."
        error={issues.circumstances}
      >
        <AutoTextarea
          id="circumstances"
          value={value.circumstances}
          onChange={(e) => set({ circumstances: e.target.value })}
          maxLength={4000}
          placeholder="Skip this if nothing comes to mind."
          autoCapitalize="sentences"
          aria-describedby="circumstances-hint"
        />
      </Question>
    </div>
  );
}

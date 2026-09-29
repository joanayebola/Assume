"use client";

import { Ban, Heart, ThumbsUp } from "lucide-react";

import { controlClasses } from "@/components/ui/field";
import { preferenceOptions, techniqueInfo } from "@/content/intake";
import { TECHNIQUES, type Technique, type TechniquePreference } from "@/lib/intake/model";
import { cn } from "@/lib/utils";

import { ChoiceCard, FieldError, Question } from "../controls";
import type { StepProps } from "./types";

const prefIcon = { love: Heart, fine: ThumbsUp, avoid: Ban } as const;

const prefStyles: Record<TechniquePreference, string> = {
  love: "bg-accent text-ink border-ink shadow-hard-xs",
  fine: "bg-background text-ink border-ink shadow-hard-xs",
  avoid: "bg-ink text-surface border-ink shadow-hard-xs",
};

export function MethodsStep({ value, onChange, issues }: StepProps<"methods">) {
  const prefFor = (t: Technique) => value.preferences.find((p) => p.technique === t)?.preference ?? null;

  const setPref = (technique: Technique, preference: TechniquePreference) => {
    const current = prefFor(technique);
    const others = value.preferences.filter((p) => p.technique !== technique);
    // Tapping the active choice again clears it back to neutral.
    const preferences =
      current === preference
        ? others
        : [...others, { technique, preference }].sort(
            (a, b) => TECHNIQUES.indexOf(a.technique) - TECHNIQUES.indexOf(b.technique),
          );
    onChange({ ...value, preferences });
  };

  return (
    <div className="space-y-10">
      <Question
        id="preferences"
        as="fieldset"
        title="How do you actually like to manifest?"
        helper="Only rate the ones you have feelings about — anything left blank stays neutral."
      >
        <ChoiceCard
          type="checkbox"
          name="methods-unsure"
          value="unsure"
          checked={value.unsure}
          onChange={() => onChange({ ...value, unsure: !value.unsure })}
          label="I'm not sure — suggest what fits my day."
          description="You can still mark anything you'd rather avoid."
          className="mb-6"
        />

        <ul className="divide-y-2 divide-ink/10 rounded-lg border-2 border-ink bg-surface">
          {TECHNIQUES.map((t) => {
            const current = prefFor(t);
            const info = techniqueInfo[t];
            return (
              <li key={t} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6">
                <div className="min-w-0">
                  <p
                    id={`tech-${t}`}
                    className={cn(
                      "font-semibold tracking-tight",
                      current === "avoid" && "text-muted-foreground line-through decoration-2",
                    )}
                  >
                    {info.label}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{info.description}</p>
                </div>
                <div role="group" aria-labelledby={`tech-${t}`} className="grid grid-cols-3 gap-1.5 sm:w-[17rem] md:w-[27rem]">
                  {preferenceOptions.map((o) => {
                    const Icon = prefIcon[o.value];
                    const on = current === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        aria-pressed={on}
                        aria-label={`${info.label}: ${o.label}`}
                        onClick={() => setPref(t, o.value)}
                        className={cn(
                          "flex h-10 items-center justify-center gap-1.5 rounded-sm border-2 px-2 text-sm font-semibold",
                          "transition-[transform,background-color,box-shadow] duration-100 active:translate-y-px",
                          on ? prefStyles[o.value] : "border-transparent bg-background text-muted-foreground hover:border-ink hover:text-ink",
                        )}
                      >
                        <Icon className={cn("size-4 shrink-0", on && o.value === "love" && "fill-current")} aria-hidden />
                        <span className="md:hidden">{o.short}</span>
                        <span className="hidden whitespace-nowrap md:inline">{o.label}</span>
                      </button>
                    );
                  })}
                </div>
                {t === "other" && current && (
                  <div className="animate-rise sm:col-span-2">
                    <label htmlFor="otherLabel" className="text-sm font-semibold">
                      What&apos;s it called?
                    </label>
                    <input
                      id="otherLabel"
                      value={value.otherLabel}
                      onChange={(e) => onChange({ ...value, otherLabel: e.target.value })}
                      maxLength={80}
                      placeholder="e.g. Pillow method"
                      enterKeyHint="done"
                      aria-invalid={issues.otherLabel ? true : undefined}
                      aria-describedby={issues.otherLabel ? "otherLabel-error" : undefined}
                      className={cn(controlClasses, "mt-2 h-11")}
                    />
                    <FieldError id="otherLabel-error" message={issues.otherLabel} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <FieldError id="preferences-error" message={issues.preferences} />
      </Question>
    </div>
  );
}

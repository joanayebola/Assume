"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { controlClasses } from "@/components/ui/field";
import { techniqueInfo, weekdays } from "@/content/intake";
import { TECHNIQUES, type Technique } from "@/lib/intake/model";
import { sessionInputSchema, type SessionInput } from "@/lib/plan/edits";
import type { PlanDoc, Session } from "@/lib/plan/schema";
import { cn } from "@/lib/utils";

import { AutoTextarea, FieldError, WeekdayPicker } from "../intake/controls";

const SCENE: Technique[] = ["visualization", "sats", "revision"];
const DURATIONS = [2, 5, 10, 15, 20];

export function toInput(s: Session): SessionInput {
  return {
    title: s.title,
    technique: s.technique,
    customTechniqueLabel: s.customTechniqueLabel,
    days: s.days,
    startTime: s.startTime,
    durationMinutes: s.durationMinutes,
    flexibleTiming: s.flexibleTiming,
    optional: s.optional,
    instructions: s.instructions,
    affirmationIds: s.affirmationIds,
    askfirmationIds: s.askfirmationIds,
    visualizationPrompt: s.visualizationPrompt,
    scriptingPrompt: s.scriptingPrompt,
    notes: s.notes,
  };
}

export const blankSession: SessionInput = {
  title: "",
  technique: "affirmations",
  customTechniqueLabel: "",
  days: [1, 2, 3, 4, 5, 6, 7],
  startTime: "09:00",
  durationMinutes: 5,
  flexibleTiming: true,
  optional: false,
  instructions: "",
  affirmationIds: [],
  askfirmationIds: [],
  visualizationPrompt: "",
  scriptingPrompt: "",
  notes: "",
};

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold">
      {children}
    </label>
  );
}

function LibraryPicker({
  items,
  selected,
  onChange,
  label,
  empty,
}: {
  items: PlanDoc["affirmations"];
  selected: string[];
  onChange: (ids: string[]) => void;
  label: string;
  empty: string;
}) {
  const id = useId();
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <fieldset aria-labelledby={id}>
      <legend id={id} className="mb-2 text-sm font-semibold">
        {label}
      </legend>
      <ul className="space-y-1.5">
        {items.map((a) => (
          <li key={a.id}>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-md border-2 border-ink/15 bg-surface p-2.5 has-checked:border-ink has-checked:bg-accent-soft">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-ink"
                checked={selected.includes(a.id)}
                onChange={() =>
                  onChange(selected.includes(a.id) ? selected.filter((x) => x !== a.id) : [...selected, a.id].slice(0, 12))
                }
              />
              <span className="text-sm">{a.text}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

export function SessionEditor({
  open,
  onClose,
  initial,
  doc,
  mode,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  initial: SessionInput;
  doc: PlanDoc;
  mode: "edit" | "add";
  onSave: (input: SessionInput) => Promise<boolean>;
  saving: boolean;
}) {
  const [value, setValue] = useState<SessionInput>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const base = useId();
  const set = (patch: Partial<SessionInput>) => setValue((v) => ({ ...v, ...patch }));

  const submit = async () => {
    const parsed = sessionInputSchema.safeParse(value);
    if (!parsed.success) {
      const out: Record<string, string> = {};
      for (const i of parsed.error.issues) out[String(i.path[0])] ??= i.message;
      setErrors(out);
      return;
    }
    setErrors({});
    if (await onSave(parsed.data)) onClose();
  };

  const t = value.technique;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === "edit" ? "Edit session" : "Add a session"}
      description={mode === "edit" ? "Your changes are kept when you adjust your routine later." : "Add something of your own to your routine."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} loadingText="Saving…">
            {mode === "edit" ? "Save changes" : "Add session"}
          </Button>
        </>
      }
    >
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        noValidate
      >
        <div>
          <Label htmlFor={`${base}-title`}>Name</Label>
          <input
            id={`${base}-title`}
            value={value.title}
            onChange={(e) => set({ title: e.target.value })}
            maxLength={80}
            placeholder="e.g. Commute affirmations"
            aria-invalid={errors.title ? true : undefined}
            className={cn(controlClasses, "h-12")}
          />
          <FieldError id={`${base}-title-error`} message={errors.title} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${base}-technique`}>Technique</Label>
            <select
              id={`${base}-technique`}
              value={t}
              onChange={(e) => set({ technique: e.target.value as Technique })}
              className={cn(controlClasses, "h-12")}
            >
              {TECHNIQUES.map((x) => (
                <option key={x} value={x}>
                  {techniqueInfo[x].label}
                </option>
              ))}
            </select>
          </div>
          {t === "other" && (
            <div>
              <Label htmlFor={`${base}-custom`}>What do you call it?</Label>
              <input
                id={`${base}-custom`}
                value={value.customTechniqueLabel}
                onChange={(e) => set({ customTechniqueLabel: e.target.value })}
                maxLength={80}
                className={cn(controlClasses, "h-12")}
              />
            </div>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-sm font-semibold" aria-hidden>
            Days
          </p>
          <WeekdayPicker label="Days" value={value.days} options={weekdays} onChange={(days) => set({ days })} invalid={Boolean(errors.days)} />
          <FieldError id={`${base}-days-error`} message={errors.days} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor={`${base}-start`}>Time</Label>
            <input
              id={`${base}-start`}
              type="time"
              value={value.startTime}
              onChange={(e) => set({ startTime: e.target.value })}
              className={cn(controlClasses, "h-12 font-mono tabular-nums")}
            />
            <FieldError id={`${base}-start-error`} message={errors.startTime} />
          </div>
          <div>
            <Label htmlFor={`${base}-duration`}>Minutes</Label>
            <input
              id={`${base}-duration`}
              type="number"
              inputMode="numeric"
              min={1}
              max={180}
              value={Number.isNaN(value.durationMinutes) ? "" : value.durationMinutes}
              onChange={(e) => set({ durationMinutes: e.target.value === "" ? Number.NaN : Math.round(Number(e.target.value)) })}
              className={cn(controlClasses, "h-12 font-mono tabular-nums")}
            />
            <FieldError id={`${base}-duration-error`} message={errors.durationMinutes} />
          </div>
        </div>
        <div className="-mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Quick durations">
          {DURATIONS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={value.durationMinutes === d}
              onClick={() => set({ durationMinutes: d })}
              className={cn(
                "rounded-sm border-2 px-2.5 py-1 font-mono text-xs font-semibold",
                value.durationMinutes === d ? "border-ink bg-ink text-surface" : "border-ink/25 bg-surface hover:border-ink",
              )}
            >
              {d} min
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input type="checkbox" className="mt-1 size-4 accent-ink" checked={value.flexibleTiming} onChange={(e) => set({ flexibleTiming: e.target.checked })} />
            <span className="text-sm">
              <span className="font-semibold">Flexible time</span> — it can move within this part of the day
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2.5">
            <input type="checkbox" className="mt-1 size-4 accent-ink" checked={value.optional} onChange={(e) => set({ optional: e.target.checked })} />
            <span className="text-sm">
              <span className="font-semibold">Optional</span> — a nice extra that doesn&apos;t count toward your daily time
            </span>
          </label>
        </div>

        <div>
          <Label htmlFor={`${base}-instructions`}>What to do</Label>
          <AutoTextarea
            id={`${base}-instructions`}
            value={value.instructions}
            onChange={(e) => set({ instructions: e.target.value })}
            minRows={3}
            maxLength={1200}
            invalid={Boolean(errors.instructions)}
          />
          <FieldError id={`${base}-instructions-error`} message={errors.instructions} />
        </div>

        {SCENE.includes(t) && (
          <div>
            <Label htmlFor={`${base}-scene`}>The scene</Label>
            <AutoTextarea
              id={`${base}-scene`}
              value={value.visualizationPrompt}
              onChange={(e) => set({ visualizationPrompt: e.target.value })}
              minRows={2}
              maxLength={1200}
              placeholder="What are you seeing, hearing, feeling once it's real?"
            />
          </div>
        )}
        {t === "scripting" && (
          <div>
            <Label htmlFor={`${base}-script`}>Writing prompt</Label>
            <AutoTextarea
              id={`${base}-script`}
              value={value.scriptingPrompt}
              onChange={(e) => set({ scriptingPrompt: e.target.value })}
              minRows={2}
              maxLength={1200}
            />
          </div>
        )}
        {t === "affirmations" && (
          <LibraryPicker
            label="Affirmations to use"
            items={doc.affirmations}
            selected={value.affirmationIds}
            onChange={(affirmationIds) => set({ affirmationIds })}
            empty="You don't have any affirmations yet — add some in “Your affirmations” below the schedule."
          />
        )}
        {t === "askfirmations" && (
          <LibraryPicker
            label="Questions to use"
            items={doc.askfirmations}
            selected={value.askfirmationIds}
            onChange={(askfirmationIds) => set({ askfirmationIds })}
            empty="You don't have any askfirmations yet — add some below the schedule."
          />
        )}

        <div>
          <Label htmlFor={`${base}-notes`}>Notes (optional)</Label>
          <AutoTextarea id={`${base}-notes`} value={value.notes} onChange={(e) => set({ notes: e.target.value })} minRows={2} maxLength={600} />
        </div>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}

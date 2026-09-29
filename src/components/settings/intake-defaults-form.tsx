"use client";

import { useState } from "react";

import { Segmented } from "@/components/intake/controls";
import { Button } from "@/components/ui/button";
import { controlClasses } from "@/components/ui/field";
import { routineStyleOptions, techniqueInfo, timeBudgetOptions } from "@/content/intake";
import { updateIntakeDefaults } from "@/lib/actions/profile";
import type { IntakeDefaults } from "@/lib/intake/defaults";
import { TECHNIQUES, type Technique } from "@/lib/intake/model";
import { cn } from "@/lib/utils";

type Pref = "love" | "neutral" | "avoid";

/** Defaults that prefill every new plan. */
export function IntakeDefaultsForm({ initial }: { initial: IntakeDefaults }) {
  const [d, setD] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);

  const prefOf = (t: Technique): Pref => (d.loved.includes(t) ? "love" : d.avoided.includes(t) ? "avoid" : "neutral");
  const setPref = (t: Technique, p: Pref) =>
    setD((x) => ({
      ...x,
      loved: p === "love" ? [...x.loved.filter((y) => y !== t), t] : x.loved.filter((y) => y !== t),
      avoided: p === "avoid" ? [...x.avoided.filter((y) => y !== t), t] : x.avoided.filter((y) => y !== t),
    }));

  const save = async () => {
    setSaving(true);
    setStatus(null);
    const r = await updateIntakeDefaults(d).catch(() => ({ ok: false as const, message: "We couldn't reach the server." }));
    setSaving(false);
    setStatus(r.ok ? { tone: "success", text: r.message ?? "Saved." } : { tone: "error", text: r.message });
  };

  return (
    <div className="space-y-7">
      <div className="grid gap-4 sm:grid-cols-2">
        {(["wakeTime", "sleepTime"] as const).map((k) => (
          <label key={k} className="block space-y-2">
            <span className="text-sm font-semibold">{k === "wakeTime" ? "Usually wake up" : "Usually go to sleep"}</span>
            <input type="time" value={d[k]} onChange={(e) => setD((x) => ({ ...x, [k]: e.target.value }))} className={cn(controlClasses, "h-12")} />
          </label>
        ))}
      </div>

      <fieldset>
        <legend className="mb-3 text-sm font-semibold">Techniques</legend>
        <ul className="divide-y-2 divide-ink/10 overflow-hidden rounded-md border-2 border-ink bg-background">
          {TECHNIQUES.filter((t) => t !== "other").map((t) => (
            <li key={t} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-semibold">{techniqueInfo[t].label.replace(" / quiet assumption", "")}</span>
              <Segmented
                name={`pref-${t}`}
                ariaLabel={`How you feel about ${techniqueInfo[t].label}`}
                value={prefOf(t)}
                onChange={(p) => setPref(t, p)}
                className="self-start shadow-none [&>label]:min-w-0 [&>label]:px-3 [&>label]:py-1.5 [&>label]:text-sm"
                options={[
                  { value: "love", label: "Love" },
                  { value: "neutral", label: "Fine" },
                  { value: "avoid", label: "Skip" },
                ]}
              />
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className="text-sm font-semibold">Routine intensity</span>
          <select
            value={d.style ?? ""}
            onChange={(e) => setD((x) => ({ ...x, style: (e.target.value || null) as IntakeDefaults["style"] }))}
            className={cn(controlClasses, "h-12")}
          >
            <option value="">Ask me each time</option>
            {routineStyleOptions
              .filter((o) => o.value !== "custom")
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </select>
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-semibold">Time each day</span>
          <select
            value={d.timeBudget ?? ""}
            onChange={(e) => setD((x) => ({ ...x, timeBudget: (e.target.value || null) as IntakeDefaults["timeBudget"] }))}
            className={cn(controlClasses, "h-12")}
          >
            <option value="">Ask me each time</option>
            {timeBudgetOptions
              .filter((o) => o.value !== "custom")
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button onClick={save} loading={saving} loadingText="Saving…" disabled={!dirty}>
          Save preferences
        </Button>
        {status && (
          <p role="status" className={cn("text-sm font-medium", status.tone === "error" && "text-destructive")}>
            {status.text}
          </p>
        )}
      </div>
    </div>
  );
}

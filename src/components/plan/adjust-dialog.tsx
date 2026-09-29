"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/notice";
import { techniqueInfo } from "@/content/intake";
import { requestPlanAdjustment } from "@/lib/actions/plan";
import type { AdjustmentKind, AdjustmentRequest } from "@/lib/ai/prompt";
import type { Technique } from "@/lib/intake/model";
import type { PlanDoc } from "@/lib/plan/schema";
import { routes } from "@/lib/site";
import { cn } from "@/lib/utils";

import { AutoTextarea } from "../intake/controls";

const OPTIONS: { kind: Exclude<AdjustmentKind, "remove_technique" | "schedule_changed" | "custom">; label: string; hint: string }[] = [
  { kind: "lighter", label: "Make it lighter", hint: "Fewer or shorter sessions" },
  { kind: "more_structured", label: "Make it more structured", hint: "Clear, fixed times" },
  { kind: "less_morning", label: "Less morning practice", hint: "Move or trim before midday" },
  { kind: "less_evening", label: "Less evening practice", hint: "Move or trim after 6pm" },
  { kind: "more_affirmations", label: "More affirmations", hint: "Give them a bigger role" },
  { kind: "fewer_affirmations", label: "Fewer affirmations", hint: "Scale them back" },
];

function Chip({ on, onClick, children, hint }: { on: boolean; onClick: () => void; children: React.ReactNode; hint?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex items-start gap-2.5 rounded-md border-2 p-3 text-left transition-[background-color,transform] duration-100 active:translate-y-px",
        on ? "border-ink bg-accent shadow-hard-xs" : "border-ink/20 bg-surface hover:border-ink",
      )}
    >
      <span aria-hidden className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-xs border-2 border-ink", on ? "bg-ink text-accent" : "bg-background")}>
        {on && <Check className="size-3" strokeWidth={4} />}
      </span>
      <span>
        <span className="block font-semibold leading-snug">{children}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
}

export function AdjustDialog({
  open,
  onClose,
  planId,
  doc,
}: {
  open: boolean;
  onClose: () => void;
  planId: string;
  doc: PlanDoc;
}) {
  const router = useRouter();
  const base = useId();
  const [kinds, setKinds] = useState<AdjustmentKind[]>([]);
  const [remove, setRemove] = useState<Technique[]>([]);
  const [scheduleChange, setScheduleChange] = useState("");
  const [custom, setCustom] = useState("");
  const [keepEdited, setKeepEdited] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const used = [...new Set(doc.sessions.map((s) => s.technique))];
  const editedCount = doc.sessions.filter((s) => s.userEdited).length;
  const toggle = (k: AdjustmentKind, on?: boolean) =>
    setKinds((prev) => ((on ?? !prev.includes(k)) ? [...new Set([...prev, k])] : prev.filter((x) => x !== k)));

  const effectiveKinds = (): AdjustmentKind[] => {
    const out = kinds.filter((k) => !["remove_technique", "schedule_changed", "custom"].includes(k));
    if (remove.length) out.push("remove_technique");
    if (scheduleChange.trim()) out.push("schedule_changed");
    if (custom.trim()) out.push("custom");
    return out;
  };

  const submit = async () => {
    const request: AdjustmentRequest = {
      kinds: effectiveKinds(),
      removeTechniques: remove,
      scheduleChange,
      customInstruction: custom,
      keepEditedSessions: keepEdited,
    };
    if (!request.kinds.length) {
      setError("Choose at least one change.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await requestPlanAdjustment(planId, request);
    if (!result.ok) {
      setSubmitting(false);
      setError(result.message);
      return;
    }
    router.push(`${routes.plans}/generating/${result.requestId}`);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Adjust my routine"
      description="We'll only change what you ask for. Your current routine is kept in version history."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting} loadingText="Starting…">
            Update my routine
          </Button>
        </>
      }
    >
      <div className="space-y-7">
        {error && <Notice tone="error">{error}</Notice>}

        <div className="grid gap-2 sm:grid-cols-2">
          {OPTIONS.map((o) => (
            <Chip key={o.kind} on={kinds.includes(o.kind)} onClick={() => toggle(o.kind)} hint={o.hint}>
              {o.label}
            </Chip>
          ))}
        </div>

        {used.length > 0 && (
          <fieldset>
            <legend className="mb-2 font-semibold">Remove a technique</legend>
            <div className="flex flex-wrap gap-1.5">
              {used.map((t) => {
                const on = remove.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setRemove((r) => (on ? r.filter((x) => x !== t) : [...r, t]))}
                    className={cn(
                      "rounded-sm border-2 px-2.5 py-1.5 text-sm font-semibold",
                      on ? "border-ink bg-ink text-surface line-through decoration-2" : "border-ink/25 bg-surface hover:border-ink",
                    )}
                  >
                    Remove {techniqueInfo[t].label.replace(" / quiet assumption", "")}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <div>
          <label htmlFor={`${base}-schedule`} className="font-semibold">
            My schedule changed
          </label>
          <p className="mt-0.5 text-sm text-muted-foreground">What&apos;s different now? We&apos;ll rebuild around it.</p>
          <AutoTextarea
            id={`${base}-schedule`}
            value={scheduleChange}
            onChange={(e) => setScheduleChange(e.target.value)}
            minRows={2}
            maxLength={1000}
            placeholder="e.g. I start at 8 now and work from home on Fridays."
            className="mt-2"
          />
        </div>

        <div>
          <label htmlFor={`${base}-custom`} className="font-semibold">
            Something else
          </label>
          <AutoTextarea
            id={`${base}-custom`}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            minRows={2}
            maxLength={1000}
            placeholder="e.g. Swap the midday session for something I can do at my desk."
            className="mt-2"
          />
        </div>

        {editedCount > 0 && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border-2 border-ink/15 bg-surface p-3">
            <input type="checkbox" className="mt-1 size-4 accent-ink" checked={keepEdited} onChange={(e) => setKeepEdited(e.target.checked)} />
            <span className="text-sm">
              <span className="font-semibold">Keep the {editedCount === 1 ? "session" : `${editedCount} sessions`} I&apos;ve edited</span>
              <span className="block text-muted-foreground">They stay exactly as you left them (unless you remove their technique).</span>
            </span>
          </label>
        )}
      </div>
    </Dialog>
  );
}

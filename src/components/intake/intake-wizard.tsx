"use client";

import { ArrowLeft, ArrowRight, CircleAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { LogoMark } from "@/components/brand/logo";
import { Button, ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { stepMeta } from "@/content/intake";
import { saveIntakeProgress, submitIntake } from "@/lib/actions/intake";
import {
  STEP_KEYS,
  isStepKey,
  type IntakeDraft,
  type IntakeSections,
  type SectionKey,
  type StepKey,
} from "@/lib/intake/model";
import { completionIssues, firstIncompleteSection } from "@/lib/intake/schema";
import { routes } from "@/lib/site";
import { cn } from "@/lib/utils";

import { IntakeProgress } from "./progress";
import { SaveIndicator } from "./save-indicator";
import { AffirmationsStep } from "./steps/affirmations-step";
import { ContextStep } from "./steps/context-step";
import { DayStep } from "./steps/day-step";
import { DesireStep } from "./steps/desire-step";
import { IntensityStep } from "./steps/intensity-step";
import { MethodsStep } from "./steps/methods-step";
import { ReviewStep } from "./steps/review-step";
import { useAutosave } from "./use-autosave";
import { trackClient } from "@/lib/analytics/client";

const sectionsOf = (d: IntakeDraft): IntakeSections => ({
  desire: d.desire,
  affirmations: d.affirmations,
  methods: d.methods,
  day: d.day,
  intensity: d.intensity,
  context: d.context,
});

const indexOf = (s: StepKey) => STEP_KEYS.indexOf(s);

export function IntakeWizard({
  draft,
  timezone,
  isDemo,
}: {
  draft: IntakeDraft;
  timezone: string;
  isDemo: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [sections, setSections] = useState<IntakeSections>(() => sectionsOf(draft));
  const [completed, setCompleted] = useState<StepKey[]>(draft.completedSteps);
  const [attempted, setAttempted] = useState<Set<SectionKey>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const { state: saveState, fatal, schedule, flush } = useAutosave(draft.id);

  // ---- Which step are we on? -------------------------------------------------
  // The URL is the source of truth (so browser back/forward work), bounded by
  // the furthest step the user can reach: you can't skip past an unanswered step.
  const reachable: StepKey = useMemo(() => firstIncompleteSection(sections) ?? "review", [sections]);
  const requested = searchParams.get("step");
  const fromReview = searchParams.get("from") === "review";

  const step: StepKey = useMemo(() => {
    const wanted = isStepKey(requested) ? requested : draft.currentStep;
    return indexOf(wanted) <= indexOf(reachable) ? wanted : reachable;
  }, [requested, draft.currentStep, reachable]);

  // Keep the URL honest if it asked for a step we can't show yet.
  useEffect(() => {
    if (requested !== step) {
      const params = new URLSearchParams(searchParams);
      params.set("step", step);
      router.replace(`${pathname}?${params}`, { scroll: false });
    }
  }, [requested, step, pathname, router, searchParams]);

  // ---- Transitions & focus ---------------------------------------------------
  const [prevStep, setPrevStep] = useState(step);
  const [direction, setDirection] = useState<1 | -1>(1);
  if (step !== prevStep) {
    setDirection(indexOf(step) > indexOf(prevStep) ? 1 : -1);
    setPrevStep(step);
  }

  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  // ---- Navigation -------------------------------------------------------------
  const goTo = useCallback(
    (next: StepKey, opts: { completed?: StepKey[]; from?: "review" } = {}) => {
      void flush();
      const params = new URLSearchParams();
      params.set("step", next);
      if (opts.from) params.set("from", opts.from);
      router.push(`${pathname}?${params}`, { scroll: false });
      void saveIntakeProgress({
        intakeId: draft.id,
        currentStep: next,
        completedSteps: opts.completed ?? completed,
      });
    },
    [flush, router, pathname, draft.id, completed],
  );

  const update = useCallback(
    <K extends SectionKey>(key: K, value: IntakeSections[K]) => {
      setSections((prev) => ({ ...prev, [key]: value }));
      schedule(key, value);
    },
    [schedule],
  );

  const issuesFor = (key: SectionKey) => (attempted.has(key) ? completionIssues(key, sections[key]) : {});

  const stepContainer = useRef<HTMLDivElement>(null);

  const onContinue = async () => {
    if (step === "review") return onSubmit();
    const key = step;
    const issues = completionIssues(key, sections[key]);
    if (Object.keys(issues).length > 0) {
      setAttempted((prev) => new Set(prev).add(key));
      // Wait for errors to render, then bring the first one into view.
      requestAnimationFrame(() => {
        const el = stepContainer.current?.querySelector<HTMLElement>('[aria-invalid="true"], [id$="-error"]');
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
        if (el && el.matches("input, textarea, select")) el.focus({ preventScroll: true });
      });
      return;
    }
    const nextCompleted = completed.includes(key) ? completed : [...completed, key];
    if (!completed.includes(key)) trackClient("intake_step_completed", { step: key });
    setCompleted(nextCompleted);
    const allDone = firstIncompleteSection(sections) === null;
    const next = fromReview && allDone ? "review" : STEP_KEYS[indexOf(key) + 1];
    goTo(next, { completed: nextCompleted });
  };

  const onBack = () => {
    const i = indexOf(step);
    if (fromReview) return goTo("review");
    if (i > 0) goTo(STEP_KEYS[i - 1]);
  };

  const onSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    await flush();
    const result = await submitIntake(draft.id); // redirects on success
    setSubmitting(false);
    if (!result || result.ok) return;
    if (result.code === "incomplete" && result.step) {
      setAttempted((prev) => new Set(prev).add(result.step!));
      goTo(result.step);
      return;
    }
    if (result.code === "locked") {
      router.refresh();
      return;
    }
    if (result.code === "payment_required") {
      router.push(`${routes.checkout}?intake=${draft.id}`);
      return;
    }
    setSubmitError(result.message);
  };

  const finishLater = async () => {
    setLeaving(true);
    await Promise.race([flush(), new Promise((r) => setTimeout(r, 4000))]);
    router.push(routes.appHome);
  };

  // ---- Render -------------------------------------------------------------------
  const i = indexOf(step);
  const meta = stepMeta[step];

  let body: ReactNode;
  switch (step) {
    case "desire":
      body = <DesireStep value={sections.desire} onChange={(v) => update("desire", v)} issues={issuesFor("desire")} />;
      break;
    case "affirmations":
      body = (
        <AffirmationsStep
          value={sections.affirmations}
          onChange={(v) => update("affirmations", v)}
          issues={issuesFor("affirmations")}
        />
      );
      break;
    case "methods":
      body = <MethodsStep value={sections.methods} onChange={(v) => update("methods", v)} issues={issuesFor("methods")} />;
      break;
    case "day":
      body = <DayStep value={sections.day} onChange={(v) => update("day", v)} issues={issuesFor("day")} />;
      break;
    case "intensity":
      body = (
        <IntensityStep
          value={sections.intensity}
          onChange={(v) => update("intensity", v)}
          issues={issuesFor("intensity")}
        />
      );
      break;
    case "context":
      body = <ContextStep value={sections.context} onChange={(v) => update("context", v)} issues={issuesFor("context")} />;
      break;
    case "review":
      body = (
        <ReviewStep sections={sections} timezone={timezone} onEdit={(s) => goTo(s, { from: "review" })} />
      );
      break;
  }

  if (fatal) return <FatalState reason={fatal} />;

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <header className="pt-safe sticky top-0 z-30 border-b-2 border-ink bg-background/95 backdrop-blur-sm">
        {isDemo && (
          <p className="bg-ink px-gutter py-1 text-center font-mono text-[0.68rem] font-semibold uppercase tracking-wider text-surface">
            Demo mode · answers are stored locally
          </p>
        )}
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-gutter sm:px-6">
          <Link href={routes.appHome} aria-label="Assume — home" className="rounded-sm">
            <LogoMark className="size-7" />
          </Link>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
            <span className="font-mono text-muted-foreground">
              {i + 1}/{STEP_KEYS.length}
            </span>{" "}
            {meta.label}
          </p>
          <SaveIndicator state={saveState} />
          <Button variant="ghost" size="sm" onClick={finishLater} loading={leaving} loadingText="Saving…">
            <span className="sm:hidden">Finish later</span>
            <span className="hidden sm:inline">Save and finish later</span>
          </Button>
        </div>
        <div className="mx-auto max-w-3xl px-gutter pb-3 sm:px-6">
          <IntakeProgress current={step} completed={completed} />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-gutter pt-10 pb-16 sm:px-6 sm:pt-14">
        <div
          key={step}
          ref={stepContainer}
          className={cn(direction === 1 ? "animate-step-forward" : "animate-step-back")}
        >
          <h1
            ref={headingRef}
            tabIndex={-1}
            className={cn(
              "outline-none",
              step === "review"
                ? "mb-3 text-display-md font-extrabold"
                : "mb-8 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground",
            )}
          >
            {step === "review" ? "Here's what you told us." : `Step ${i + 1} · ${meta.label}`}
          </h1>
          {step === "review" && (
            <p className="mb-10 text-lg text-muted-foreground">
              Check it over. You can edit anything before we build your routine.
            </p>
          )}

          {body}

          {submitError && (
            <Notice tone="error" className="mt-8">
              {submitError}
            </Notice>
          )}

          <div className="mt-14 flex flex-col-reverse items-stretch gap-3 border-t-2 border-ink pt-6 sm:flex-row sm:items-center sm:justify-between">
            {i > 0 ? (
              <Button variant="ghost" onClick={onBack} iconLeft={<ArrowLeft aria-hidden />}>
                {fromReview ? "Back to review" : "Back"}
              </Button>
            ) : (
              <span className="hidden sm:block" />
            )}
            <Button
              size="lg"
              onClick={onContinue}
              loading={submitting}
              loadingText="Saving your answers…"
              iconRight={<ArrowRight aria-hidden />}
            >
              {step === "review" ? "Build my routine" : fromReview ? "Save and review" : "Continue"}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

function FatalState({ reason }: { reason: "locked" | "not_found" | "auth" }) {
  const content = {
    locked: {
      title: "This plan has already been submitted.",
      body: "Your answers are safe. You can find it in My Plans.",
      href: routes.plans,
      cta: "Go to My Plans",
    },
    not_found: {
      title: "We couldn't find this plan.",
      body: "It may have been removed. You can start a new one any time.",
      href: routes.newPlan,
      cta: "Start a new plan",
    },
    auth: {
      title: "Your session has expired.",
      body: "Log in again and pick up where you left off — everything up to your last save is kept.",
      href: routes.login,
      cta: "Log in",
    },
  }[reason];

  return (
    <main id="main" className="grid flex-1 place-items-center px-gutter py-16">
      <div role="alert" className="w-full max-w-md rounded-xl border-2 border-ink bg-surface p-6 shadow-hard-lg sm:p-8">
        <CircleAlert className="size-7" aria-hidden />
        <h1 className="mt-4 text-display-sm font-extrabold">{content.title}</h1>
        <p className="mt-3 text-muted-foreground">{content.body}</p>
        <ButtonLink href={content.href} className="mt-6">
          {content.cta}
        </ButtonLink>
      </div>
    </main>
  );
}

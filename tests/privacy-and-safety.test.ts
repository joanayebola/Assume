import { describe, expect, it } from "vitest";

import { validateProps } from "@/lib/analytics/events";
import { careGuidance, careThemes, ensureCareNote } from "@/lib/ai/safety";
import { intakeContext } from "@/lib/ai/prompt";
import { intakeDefaultsSchema, prefilledSections } from "@/lib/intake/defaults";
import { describeError, redact } from "@/lib/log";
import { checkPlan } from "@/lib/plan/checks";

import { officeWorker } from "./fixtures/users";
import { planDoc, session } from "./support/plan";

const withCircumstances = (circumstances: string) => ({
  ...officeWorker,
  manifestation: { ...officeWorker.manifestation, circumstances },
});

describe("care for serious circumstances", () => {
  it("detects health, legal, safety and money themes without echoing text", () => {
    expect(careThemes(withCircumstances("Waiting on biopsy results after surgery"))).toContain("health");
    expect(careThemes(withCircumstances("Custody hearing in March"))).toContain("legal");
    expect(careThemes(withCircumstances("My ex keeps threatening me"))).toContain("safety");
    expect(careThemes(withCircumstances("Behind on rent and credit card debt"))).toContain("financial");
    expect(careThemes(withCircumstances("I want a promotion at work"))).toEqual([]);
  });

  it("tells the model gently, only when relevant", () => {
    expect(careGuidance([])).toBeNull();
    const g = careGuidance(["health"])!;
    expect(g).toMatch(/alongside/);
    expect(g).not.toMatch(/biopsy/);
    expect(intakeContext(withCircumstances("My diagnosis")).derived.care).toMatch(/health/);
    expect(intakeContext(officeWorker).derived.care).toBeNull();
  });

  it("adds one quiet sentence to the plan if the model didn't", () => {
    const doc = planDoc(officeWorker, [session()], { philosophy: "Tools, not tests." });
    const out = ensureCareNote(doc, ["health", "safety"]);
    expect(out.philosophy).toMatch(/^Tools, not tests\. If you're ever unsafe/);
    expect(out.philosophy.split(". ").length).toBeLessThan(4);
    // Already there → untouched.
    const already = planDoc(officeWorker, [session()], { philosophy: "Keep following your doctor's advice alongside this." });
    expect(ensureCareNote(already, ["health"]).philosophy).toBe(already.philosophy);
    expect(ensureCareNote(doc, []).philosophy).toBe(doc.philosophy);
  });

  it("rejects plans that discourage real-world help or make medical claims", () => {
    for (const text of [
      "Visualise instead of seeing a doctor.",
      "You don't need therapy, just affirmations.",
      "Stop taking your medication and trust the process.",
      "This routine cures your illness.",
    ]) {
      const doc = planDoc(officeWorker, [session({ instructions: text })]);
      expect(checkPlan(doc, officeWorker).map((p) => p.message).join(" ")).toMatch(/discourages real-world help|medical claim/);
    }
    const fine = planDoc(officeWorker, [session({ instructions: "Picture the calm after your appointment, then get on with your day." })]);
    expect(checkPlan(fine, officeWorker).filter((p) => /real-world|medical/.test(p.message))).toEqual([]);
  });
});

describe("logs never carry what people write", () => {
  it("redacts quoted text, Postgres row dumps and key values", () => {
    expect(redact('"Texting J every morning" (Mon–Fri 07:30) overlaps "Commute"')).toBe("[…] (Mon–Fri 07:30) overlaps […]");
    expect(redact("new row violates check constraint. Failing row contains (abc, my secret desire)")).toMatch(/\[redacted\]$/);
    expect(redact("duplicate key value violates unique constraint. Key (email)=(me@example.com) already exists.")).not.toContain("example.com");
  });

  it("describes errors by shape only", () => {
    const e = Object.assign(new Error('Plan failed checks: "Call my ex" overlaps work'), { code: "quality_check_failed" });
    const d = describeError(e);
    expect(d).toMatchObject({ name: "Error", code: "quality_check_failed" });
    expect(JSON.stringify(d)).not.toContain("Call my ex");
  });
});

describe("analytics", () => {
  it("accepts only schema-shaped properties", () => {
    expect(validateProps("intake_step_completed", { step: "desire" })).toEqual({ step: "desire" });
    expect(validateProps("generation_failed", { kind: "initial", code: "timeout" })).toEqual({ kind: "initial", code: "timeout" });
  });

  it("can't carry free text", () => {
    expect(validateProps("intake_step_completed", { step: "I want my ex back" })).toBeNull();
    expect(validateProps("generation_failed", { kind: "initial", code: "My SP texted me" })).toBeNull();
    // Unknown keys are stripped, not forwarded.
    expect(validateProps("plan_viewed", { desire: "a new car" })).toEqual({});
  });
});

describe("manifestation preferences", () => {
  it("prefill new intakes with saved defaults", () => {
    const d = intakeDefaultsSchema.parse({ wakeTime: "06:30", sleepTime: "23:00", loved: ["sats"], avoided: ["scripting"], style: "light", timeBudget: "5_10" });
    const s = prefilledSections(d);
    expect(s.day).toMatchObject({ wakeTime: "06:30", sleepTime: "23:00", commitments: [] });
    expect(s.methods?.preferences).toEqual([
      { technique: "sats", preference: "love" },
      { technique: "scripting", preference: "avoid" },
    ]);
    expect(s.intensity).toMatchObject({ style: "light", timeBudget: "5_10" });
  });

  it("leaves untouched sections alone and rejects contradictions", () => {
    expect(prefilledSections(intakeDefaultsSchema.parse({ wakeTime: "", sleepTime: "", loved: [], avoided: [], style: null, timeBudget: null }))).toEqual({});
    expect(intakeDefaultsSchema.safeParse({ wakeTime: "", sleepTime: "", loved: ["sats"], avoided: ["sats"], style: null, timeBudget: null }).success).toBe(false);
  });
});

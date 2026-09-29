import { describe, expect, it } from "vitest";

import { GenerationError, type RoutineGenerator } from "@/lib/ai/generator";
import { buildLocalPlan, LocalRoutineGenerator } from "@/lib/ai/local-generator";
import type { AIPlan, AISession } from "@/lib/ai/schema";
import { produceAdjustedPlan, produceInitialPlan, produceRegeneratedSession } from "@/lib/generation/pipeline";
import { checkPlan } from "@/lib/plan/checks";
import { minutesByDay } from "@/lib/plan/schema";
import { toMinutes } from "@/lib/plan/time";

import { fixtures, minimalFiveMinutes, nightShiftNurse, noAffirmations, officeWorker } from "./fixtures/users";

const local = new LocalRoutineGenerator();

describe("local generator across radically different people", () => {
  for (const [name, snapshot] of Object.entries(fixtures)) {
    it(`${name}: produces a plan that passes every check`, async () => {
      const { doc } = await produceInitialPlan(local, snapshot, { manifestationId: null });
      expect(doc.sessions.length).toBeGreaterThan(0);
      expect(checkPlan(doc, snapshot).filter((p) => !p.code.startsWith("style_"))).toEqual([]);

      const [, max] = snapshot.intensity.minutesPerDay;
      if (max !== null) for (const m of Object.values(minutesByDay(doc))) expect(m).toBeLessThanOrEqual(max + Math.max(2, max * 0.1));
      for (const s of doc.sessions) expect(snapshot.techniques.avoid).not.toContain(s.technique);
    });
  }

  it("gives different people meaningfully different schedules (not one template)", () => {
    const signature = (name: keyof typeof fixtures) =>
      buildLocalPlan(fixtures[name])
        .sessions.map((s) => `${s.technique}@${s.startTime}/${s.days.join("")}`)
        .sort()
        .join("|");
    const people = ["officeWorker", "universityStudent", "nightShiftNurse", "stayAtHomeParent", "freelancer"] as const;
    const sigs = new Set(people.map(signature));
    expect(sigs.size).toBe(people.length);
  });

  it("uses the commute for audio practice and keeps work hours clear (office worker)", async () => {
    const { doc } = await produceInitialPlan(local, officeWorker, { manifestationId: null });
    const workHours = doc.sessions.filter((s) => {
      const m = toMinutes(s.startTime);
      return s.days.some((d) => d <= 5) && m >= 9 * 60 && m < 17 * 60;
    });
    expect(workHours).toEqual([]);
    const commute = doc.sessions.find((s) => s.contextActivity.startsWith("Commute"));
    expect(commute?.technique).toBe("affirmations");
    expect(doc.sessions.find((s) => s.technique === "sats")).toBeTruthy();
    // Uses their own words.
    const own = new Set(doc.affirmations.filter((a) => a.source === "user").map((a) => a.id));
    expect(commute!.affirmationIds.some((id) => own.has(id))).toBe(true);
  });

  it("schedules a night-shift nurse around sleeping in the day", async () => {
    const { doc } = await produceInitialPlan(local, nightShiftNurse, { manifestationId: null });
    const sats = doc.sessions.find((s) => s.technique === "sats");
    expect(sats && toMinutes(sats.startTime)).toBeGreaterThan(7 * 60); // morning bedtime
    expect(sats && toMinutes(sats.startTime)).toBeLessThan(9 * 60);
  });

  it("keeps a 5-minute plan at 5 minutes", async () => {
    const { doc } = await produceInitialPlan(local, minimalFiveMinutes, { manifestationId: null });
    expect(Math.max(...Object.values(minutesByDay(doc)))).toBeLessThanOrEqual(5);
  });

  it("never includes affirmations when the user doesn't want them", async () => {
    const { doc } = await produceInitialPlan(local, noAffirmations, { manifestationId: null });
    expect(doc.affirmations).toEqual([]);
    expect(doc.sessions.every((s) => s.technique !== "affirmations" && s.affirmationIds.length === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Pipeline behaviour with a scripted (fake) model
// ---------------------------------------------------------------------------

function aiSession(o: Partial<AISession> = {}): AISession {
  return {
    title: "Bedtime SATS",
    technique: "sats",
    customTechniqueLabel: "",
    days: [1, 2, 3, 4, 5, 6, 7],
    startTime: "22:45",
    durationMinutes: 10,
    flexibleTiming: false,
    optional: false,
    recurrenceLabel: "Every night",
    instructions: "Loop the scene as you drift off.",
    affirmations: [],
    askfirmations: [],
    visualizationPrompt: "Reading the email that says it's official.",
    scriptingPrompt: "",
    notes: "",
    contextActivity: "",
    fitReason: "Right before sleep.",
    ...o,
  };
}

function aiPlan(sessions: AISession[], o: Partial<AIPlan> = {}): AIPlan {
  return {
    title: "Senior designer, by way of your commute",
    explanation: "Built around your commute and bedtime.",
    philosophy: "Tools, not tests.",
    generatedAffirmations: [],
    generatedAskfirmations: [],
    patterns: [{ label: "Every day", days: [1, 2, 3, 4, 5, 6, 7], summary: "Same rhythm daily." }],
    sessions,
    ...o,
  };
}

function scripted(responses: (unknown | Error)[]): RoutineGenerator & { calls: { feedback?: string[] }[] } {
  const calls: { feedback?: string[] }[] = [];
  const next = async (input: { feedback?: string[] }) => {
    calls.push({ feedback: input.feedback });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  };
  return { model: "fake", calls, createPlan: next, adjustPlan: next, regenerateSession: next };
}

const good = aiPlan([
  aiSession(),
  aiSession({
    title: "Commute affirmations",
    technique: "affirmations",
    days: [1, 2, 3, 4, 5],
    startTime: "08:05",
    durationMinutes: 8,
    affirmations: ["I am the obvious choice."],
    visualizationPrompt: "",
    contextActivity: "Commute in",
    fitReason: "Your commute is audio-friendly.",
  }),
]);

describe("generation pipeline", () => {
  it("accepts a good response first time", async () => {
    const gen = scripted([good]);
    const res = await produceInitialPlan(gen, officeWorker, { manifestationId: "m1" });
    expect(res.attempts).toBe(1);
    expect(res.doc.sessions.every((s) => s.manifestationId === "m1")).toBe(true);
    // Their own affirmation is linked, not duplicated.
    expect(res.doc.affirmations.filter((a) => a.text === "I am the obvious choice.")).toHaveLength(1);
  });

  it("repairs a malformed response by retrying with the reason", async () => {
    const gen = scripted([{ nonsense: true }, good]);
    const res = await produceInitialPlan(gen, officeWorker, { manifestationId: null });
    expect(res.attempts).toBe(2);
    expect(gen.calls[1].feedback?.[0]).toMatch(/invalid/);
  });

  it("fails with invalid_output when the model never returns valid JSON", async () => {
    const gen = scripted([{ nope: 1 }, { still: "no" }]);
    await expect(produceInitialPlan(gen, officeWorker, { manifestationId: null })).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("feeds quality problems back to the model and accepts the repaired plan", async () => {
    const bad = aiPlan([aiSession({ title: "Work scripting", technique: "scripting", startTime: "10:00", days: [1], scriptingPrompt: "Write.", visualizationPrompt: "" })]);
    const gen = scripted([bad, good]);
    const res = await produceInitialPlan(gen, officeWorker, { manifestationId: null });
    expect(res.attempts).toBe(2);
    expect(gen.calls[1].feedback?.join(" ")).toMatch(/never to be given|can't manifest/);
    expect(res.doc.sessions.some((s) => s.technique === "scripting")).toBe(false);
  });

  it("removes offending sessions as a last resort rather than failing a mostly-good plan", async () => {
    const mixed = aiPlan([...good.sessions, aiSession({ title: "Work scripting", technique: "scripting", startTime: "10:00", days: [1], scriptingPrompt: "Write.", visualizationPrompt: "" })]);
    const res = await produceInitialPlan(scripted([mixed, mixed]), officeWorker, { manifestationId: null });
    expect(res.doc.sessions).toHaveLength(2);
    expect(res.autoFixed.length).toBeGreaterThan(0);
  });

  it("surfaces API failures and timeouts as retryable errors", async () => {
    const timeout = new GenerationError("timeout", "slow", true);
    await expect(produceInitialPlan(scripted([timeout]), officeWorker, { manifestationId: null })).rejects.toMatchObject({
      code: "timeout",
      retryable: true,
    });
  });

  it("adjusting keeps the user's edited sessions untouched", async () => {
    const { doc } = await produceInitialPlan(scripted([good]), officeWorker, { manifestationId: null });
    const edited = { ...doc, sessions: doc.sessions.map((s) => (s.technique === "sats" ? { ...s, startTime: "22:40", userEdited: true } : s)) };
    const lighter = aiPlan([aiSession({ title: "Short commute affirmations", technique: "affirmations", days: [1, 2, 3, 4, 5], startTime: "08:05", durationMinutes: 5, affirmations: ["My work speaks for itself."], visualizationPrompt: "", contextActivity: "Commute in" })]);
    const res = await produceAdjustedPlan(scripted([lighter]), officeWorker, edited, {
      kinds: ["lighter"],
      removeTechniques: [],
      scheduleChange: "",
      customInstruction: "",
      keepEditedSessions: true,
    });
    const sats = res.doc.sessions.find((s) => s.technique === "sats");
    expect(sats?.startTime).toBe("22:40");
    expect(sats?.userEdited).toBe(true);
    expect(res.doc.sessions).toHaveLength(2);
  });

  it("'remove technique' overrides pinning for that technique", async () => {
    const { doc } = await produceInitialPlan(scripted([good]), officeWorker, { manifestationId: null });
    const edited = { ...doc, sessions: doc.sessions.map((s) => ({ ...s, userEdited: true })) };
    const res = await produceAdjustedPlan(scripted([aiPlan([aiSession()])]), officeWorker, edited, {
      kinds: ["remove_technique"],
      removeTechniques: ["affirmations"],
      scheduleChange: "",
      customInstruction: "",
      keepEditedSessions: true,
    });
    expect(res.doc.sessions.some((s) => s.technique === "affirmations")).toBe(false);
  });

  it("regenerating one session replaces only that session, keeping its id", async () => {
    const { doc } = await produceInitialPlan(scripted([good]), officeWorker, { manifestationId: null });
    const target = doc.sessions.find((s) => s.technique === "sats")!;
    const other = doc.sessions.find((s) => s.id !== target.id)!;
    const res = await produceRegeneratedSession(
      scripted([aiSession({ title: "Bedtime visualization", technique: "visualization", startTime: "22:45" })]),
      officeWorker,
      doc,
      target.id,
      "",
    );
    const replaced = res.doc.sessions.find((s) => s.id === target.id)!;
    expect(replaced.technique).toBe("visualization");
    expect(res.doc.sessions.find((s) => s.id === other.id)).toEqual(other);
  });

  it("regeneration fails safely instead of deleting the session", async () => {
    const { doc } = await produceInitialPlan(scripted([good]), officeWorker, { manifestationId: null });
    const target = doc.sessions.find((s) => s.technique === "sats")!;
    const bad = aiSession({ technique: "scripting", startTime: "10:00", days: [1], scriptingPrompt: "Write.", visualizationPrompt: "" });
    await expect(produceRegeneratedSession(scripted([bad, bad]), officeWorker, doc, target.id, "")).rejects.toMatchObject({
      code: "quality_check_failed",
    });
  });
});

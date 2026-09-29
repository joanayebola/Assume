import { describe, expect, it } from "vitest";

import { adjustPlanPrompt, createPlanPrompt, PRINCIPLES, systemInstruction } from "@/lib/ai/prompt";
import { aiPlanSchema, toGeminiJsonSchema } from "@/lib/ai/schema";
import { SCHEDULE_OVERLAP_GUIDANCE } from "@/lib/intake/generation-guidance";
import { applyEdit } from "@/lib/plan/edits";

import { nightShiftNurse, noAffirmations, officeWorker, universityStudent } from "./fixtures/users";
import { planDoc, session } from "./support/plan";

describe("prompts", () => {
  it("carries every principle and the schedule-overlap guidance", () => {
    const sys = systemInstruction();
    expect(PRINCIPLES).toHaveLength(21);
    for (const p of PRINCIPLES) expect(sys).toContain(p);
    expect(sys).toContain(SCHEDULE_OVERLAP_GUIDANCE);
    expect(sys).toMatch(/never anything distracting if they might be driving/i);
  });

  it("describes the person's week in plain language, including unavailable time", () => {
    const p = createPlanPrompt(officeWorker);
    expect(p).toContain("Work (work) — Weekdays, 9:00am–5:00pm; UNAVAILABLE");
    expect(p).toContain("Commute in (commute) — Weekdays, 8:00am–8:45am; user can do only: Affirmations, Subliminals");
    expect(p).toContain('"neverUse": "Scripting"');
  });

  it("frames relevant dates as pacing only", () => {
    const p = createPlanPrompt(universityStudent, undefined, new Date("2026-09-28T00:00:00Z"));
    expect(p).toMatch(/2027-03-15 \(168 days away — use for gentle pacing only; never promise anything by then\)/);
  });

  it("describes overnight schedules as they are", () => {
    expect(createPlanPrompt(nightShiftNurse)).toContain("Awake: 3:00pm → asleep 8:30am.");
  });

  it("includes repair feedback when retrying", () => {
    expect(createPlanPrompt(noAffirmations, ["Session X overlaps work."])).toContain("Fix every one of them");
  });

  it("tells the model which sessions are fixed during an adjustment", () => {
    const pinned = session({ title: "My own SATS", technique: "sats", userEdited: true });
    const doc = planDoc(officeWorker, [pinned, session({ title: "Morning visualization" })]);
    const p = adjustPlanPrompt(officeWorker, doc, [pinned], {
      kinds: ["lighter", "remove_technique"],
      removeTechniques: ["visualization"],
      scheduleChange: "",
      customInstruction: "",
      keepEditedSessions: true,
    });
    expect(p).toContain("FIXED");
    expect(p).toContain("My own SATS");
    expect(p).toContain("Remove these techniques entirely: Visualization.");
  });
});

describe("Gemini JSON schema", () => {
  const SUPPORTED = new Set(["type", "properties", "required", "additionalProperties", "enum", "format", "minimum", "maximum", "items", "prefixItems", "title", "description", "anyOf"]);

  it("only uses keywords Gemini's structured output supports", () => {
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      for (const [k, v] of Object.entries(node)) {
        if (k === "properties") {
          Object.values(v as object).forEach(walk);
          continue;
        }
        expect(SUPPORTED.has(k), `unsupported keyword ${k}`).toBe(true);
        walk(v);
      }
    };
    walk(toGeminiJsonSchema(aiPlanSchema));
  });

  it("requires every session field, so the app never parses prose", () => {
    const schema = toGeminiJsonSchema(aiPlanSchema) as {
      required: string[];
      properties: { sessions: { items: { required: string[] } } };
    };
    expect(schema.required).toEqual(expect.arrayContaining(["title", "explanation", "philosophy", "patterns", "sessions"]));
    expect(schema.properties.sessions.items.required).toEqual(
      expect.arrayContaining(["technique", "days", "startTime", "durationMinutes", "instructions", "fitReason", "flexibleTiming"]),
    );
  });
});

describe("plan edits", () => {
  const base = planDoc(officeWorker, [session({ id: "s_a", title: "SATS", technique: "sats", startTime: "22:45" })]);
  const input = {
    title: "Walk affirmations",
    technique: "affirmations" as const,
    customTechniqueLabel: "",
    days: [6, 7, 6] as (1 | 2 | 3 | 4 | 5 | 6 | 7)[],
    startTime: "10:00",
    durationMinutes: 10,
    flexibleTiming: true,
    optional: false,
    instructions: "Say them as you walk.",
    affirmationIds: ["a_user_0"],
    askfirmationIds: [],
    visualizationPrompt: "",
    scriptingPrompt: "",
    notes: "",
  };

  it("adds a custom session, marked as user-edited, with derived recurrence", () => {
    const { doc, summary } = applyEdit(base, { type: "add_session", session: input });
    const added = doc.sessions.find((s) => s.title === "Walk affirmations")!;
    expect(added.origin).toBe("custom");
    expect(added.userEdited).toBe(true);
    expect(added.days).toEqual([6, 7]);
    expect(added.recurrence).toBe("weekends");
    expect(summary).toBe("Added “Walk affirmations”");
  });

  it("edits, duplicates and removes sessions", () => {
    const edited = applyEdit(base, { type: "update_session", id: "s_a", session: { ...input, title: "Bedtime SATS", technique: "sats", startTime: "22:30" } }).doc;
    expect(edited.sessions[0]).toMatchObject({ id: "s_a", title: "Bedtime SATS", startTime: "22:30", userEdited: true });
    const dup = applyEdit(edited, { type: "duplicate_session", id: "s_a" }).doc;
    expect(dup.sessions).toHaveLength(2);
    expect(new Set(dup.sessions.map((s) => s.id)).size).toBe(2);
    expect(applyEdit(dup, { type: "remove_session", id: "s_a" }).doc.sessions).toHaveLength(1);
  });

  it("removing an affirmation also removes it from sessions", () => {
    const withAff = planDoc(officeWorker, [session({ id: "s_b", technique: "affirmations", affirmationIds: ["a_user_0", "a_user_1"] })]);
    const next = applyEdit(withAff, { type: "remove_library_item", kind: "affirmation", id: "a_user_0" }).doc;
    expect(next.affirmations.map((a) => a.id)).toEqual(["a_user_1"]);
    expect(next.sessions[0].affirmationIds).toEqual(["a_user_1"]);
  });

  it("adds your own askfirmation as a question", () => {
    const next = applyEdit(base, { type: "add_library_item", kind: "askfirmation", text: "Why was it so easy" }).doc;
    expect(next.askfirmations[0]).toMatchObject({ text: "Why was it so easy?", source: "custom" });
  });

  it("refuses to edit a session that no longer exists", () => {
    expect(() => applyEdit(base, { type: "remove_session", id: "missing" })).toThrow(/no longer exists/);
  });
});

describe("Gemini transient-error retries", async () => {
  const { retryDelayMs } = await import("@/lib/ai/gemini");
  const { GenerationError } = await import("@/lib/ai/generator");

  it("waits as long as a 429 asks, within a cap", () => {
    const e = new GenerationError("rate_limited", "Quota exceeded… Please retry in 4.008965857s.", true);
    expect(retryDelayMs(e, 1)).toBe(4259);
    const long = new GenerationError("rate_limited", "Please retry in 45s.", true);
    expect(retryDelayMs(long, 1)).toBeNull();
  });

  it("backs off on 503 overload, but never retries real errors", () => {
    expect(retryDelayMs(new GenerationError("api_error", "Gemini is overloaded (503): high demand", true), 1)).toBe(2000);
    expect(retryDelayMs(new GenerationError("api_error", "Gemini API error 400: invalid", false), 1)).toBeNull();
    expect(retryDelayMs(new GenerationError("invalid_output", "bad", true), 1)).toBeNull();
  });
});

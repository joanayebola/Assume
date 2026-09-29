import { describe, expect, it } from "vitest";

import { applyFixes, checkPlan } from "@/lib/plan/checks";

import {
  conflictingData,
  hourlyPreference,
  minimalFiveMinutes,
  nightShiftNurse,
  noAffirmations,
  officeWorker,
  stayAtHomeParent,
  universityStudent,
} from "./fixtures/users";
import { planDoc, session } from "./support/plan";

const codes = (p: { code: string }[]) => p.map((x) => x.code);

describe("sanity checks", () => {
  it("accepts a sensible plan for the office worker", () => {
    const doc = planDoc(officeWorker, [
      session({ technique: "affirmations", startTime: "08:05", durationMinutes: 8, days: [1, 2, 3, 4, 5], affirmationIds: ["a_user_0"], visualizationPrompt: "" }),
      session({ technique: "sats", startTime: "22:45", durationMinutes: 10 }),
    ]);
    expect(checkPlan(doc, officeWorker)).toEqual([]);
  });

  it("rejects scripting at 10am while they're at work (unavailable)", () => {
    const s = { ...officeWorker, techniques: { ...officeWorker.techniques, avoid: [] } };
    const doc = planDoc(s, [session({ technique: "scripting", startTime: "10:00", days: [1, 2, 3, 4, 5], scriptingPrompt: "Write." })]);
    expect(codes(checkPlan(doc, s))).toContain("unavailable_overlap");
  });

  it("rejects a technique the user disliked", () => {
    const doc = planDoc(officeWorker, [session({ technique: "scripting", startTime: "20:00", scriptingPrompt: "Write." })]);
    expect(codes(checkPlan(doc, officeWorker))).toContain("avoided_technique");
  });

  it("rejects techniques the user didn't allow during an activity", () => {
    // Visualization during the commute, where they only allowed affirmations/subliminals.
    const doc = planDoc(officeWorker, [session({ technique: "visualization", startTime: "08:10", days: [1] })]);
    expect(codes(checkPlan(doc, officeWorker))).toContain("technique_not_allowed_during");
  });

  it("allows practice during an activity the user said works (gym affirmations)", () => {
    const doc = planDoc(officeWorker, [
      session({ technique: "affirmations", startTime: "18:10", durationMinutes: 5, days: [1, 3, 5], affirmationIds: ["a_user_1"], visualizationPrompt: "" }),
    ]);
    expect(checkPlan(doc, officeWorker)).toEqual([]);
  });

  it("never allows eyes-closed techniques on a commute, even when overlap is 'yes'", () => {
    const s = structuredClone(officeWorker);
    s.schedule.commitments[0].manifestationOverlap = { availability: "yes", techniques: [], otherLabel: null };
    const doc = planDoc(s, [session({ technique: "visualization", startTime: "08:10", days: [1] })]);
    expect(codes(checkPlan(doc, s))).toContain("unsafe_during_commute");
  });

  describe("overnight / night-shift schedules", () => {
    it("allows practice at 02:00 for someone awake overnight, but not during the shift", () => {
      // Shifts run Mon–Wed nights, so Thursday 02:00 is still Wednesday's shift; Fri/Sat 02:00 are free.
      const onBreak = planDoc(nightShiftNurse, [
        session({ technique: "inner_conversations", startTime: "02:00", days: [5, 6], visualizationPrompt: "" }),
      ]);
      expect(checkPlan(onBreak, nightShiftNurse)).toEqual([]);

      // Tuesday and Thursday 02:00 fall inside the previous night's 19:30–07:30 shift.
      for (const day of [2, 4] as const) {
        const duringShift = planDoc(nightShiftNurse, [
          session({ technique: "inner_conversations", startTime: "02:00", days: [day], visualizationPrompt: "" }),
        ]);
        expect(codes(checkPlan(duringShift, nightShiftNurse))).toContain("unavailable_overlap");
      }
    });

    it("rejects practice while a night-shift worker is asleep (midday)", () => {
      const doc = planDoc(nightShiftNurse, [session({ technique: "inner_conversations", startTime: "12:00", visualizationPrompt: "" })]);
      expect(codes(checkPlan(doc, nightShiftNurse))).toContain("outside_awake_hours");
    });

    it("places SATS at their (morning) bedtime", () => {
      const ok = planDoc(nightShiftNurse, [session({ technique: "sats", startTime: "08:15", durationMinutes: 10, days: [4, 5, 6, 7] })]);
      expect(checkPlan(ok, nightShiftNurse)).toEqual([]);
      const wrong = planDoc(nightShiftNurse, [session({ technique: "sats", startTime: "22:00", durationMinutes: 10, days: [4, 5, 6, 7] })]);
      expect(codes(checkPlan(wrong, nightShiftNurse))).toContain("sats_timing");
    });
  });

  it("enforces a minimal 5-minute budget", () => {
    const doc = planDoc(minimalFiveMinutes, [
      session({ technique: "affirmations", startTime: "07:15", durationMinutes: 5, affirmationIds: ["a_user_0"], visualizationPrompt: "" }),
      session({ technique: "affirmations", startTime: "21:00", durationMinutes: 5, affirmationIds: ["a_user_0"], visualizationPrompt: "" }),
    ]);
    expect(codes(checkPlan(doc, minimalFiveMinutes))).toContain("over_budget");
    // Optional extras don't count toward the budget.
    const withOptional = planDoc(minimalFiveMinutes, [
      session({ technique: "affirmations", startTime: "07:15", durationMinutes: 5, affirmationIds: ["a_user_0"], visualizationPrompt: "" }),
      session({ technique: "affirmations", startTime: "21:00", durationMinutes: 3, optional: true, affirmationIds: ["a_user_0"], visualizationPrompt: "" }),
    ]);
    expect(codes(checkPlan(withOptional, minimalFiveMinutes))).not.toContain("over_budget");
  });

  it("keeps affirmations out when the user doesn't want them", () => {
    const doc = planDoc(
      noAffirmations,
      [session({ technique: "affirmations", startTime: "08:00", visualizationPrompt: "" }), session({ startTime: "20:00", affirmationIds: ["a_x"] })],
      { affirmations: [{ id: "a_x", text: "I am healed.", source: "generated" }] },
    );
    const problems = checkPlan(doc, noAffirmations);
    expect(codes(problems)).toContain("affirmations_not_wanted");
    const fixed = applyFixes(doc, problems);
    expect(fixed.affirmations).toEqual([]);
    expect(fixed.sessions.every((x) => x.technique !== "affirmations" && x.affirmationIds.length === 0)).toBe(true);
  });

  it("prefers the user's own affirmations over replacements", () => {
    const doc = planDoc(
      officeWorker,
      [session({ technique: "affirmations", startTime: "08:05", days: [1], affirmationIds: ["a_gen"], visualizationPrompt: "" })],
      {
        affirmations: [
          { id: "a_user_0", text: "I am the obvious choice.", source: "user" },
          { id: "a_gen", text: "I'm a great designer.", source: "generated" },
        ],
      },
    );
    const problems = checkPlan(doc, officeWorker);
    expect(codes(problems)).toContain("user_affirmations_ignored");
    expect(applyFixes(doc, problems).sessions[0].affirmationIds).toEqual(["a_user_0"]);
  });

  it("rejects guarantees, science claims and guilt about missed sessions", () => {
    for (const phrase of [
      "This is guaranteed to work.",
      "Science shows this rewires your brain.",
      "If you miss a session it will delay your manifestation.",
      "You must stay positive at all times.",
      "Keep your streak going!",
    ]) {
      const doc = planDoc(officeWorker, [session({ technique: "sats", startTime: "22:45", durationMinutes: 10, instructions: phrase })]);
      expect(codes(checkPlan(doc, officeWorker)), phrase).toContain("banned_language");
    }
  });

  it("strips banned sentences as a last resort without losing the rest", () => {
    const doc = planDoc(officeWorker, [session({ technique: "sats", startTime: "22:45", durationMinutes: 10, instructions: "Loop the scene. This is guaranteed to work." })]);
    const fixed = applyFixes(doc, checkPlan(doc, officeWorker));
    expect(fixed.sessions[0].instructions).toBe("Loop the scene.");
  });

  it("handles deadlines without breaking checks (relevant date is pacing only)", () => {
    const doc = planDoc(universityStudent, [
      session({ technique: "scripting", startTime: "14:00", durationMinutes: 15, days: [1, 2, 3, 4, 5], scriptingPrompt: "Write about opening the offer." }),
    ]);
    expect(checkPlan(doc, universityStudent)).toEqual([]);
    const promised = planDoc(universityStudent, [
      session({ technique: "scripting", startTime: "14:00", durationMinutes: 15, days: [1], scriptingPrompt: "Write.", instructions: "You will definitely manifest this by March." }),
    ]);
    expect(codes(checkPlan(promised, universityStudent))).toContain("banned_language");
  });

  it("respects different weekends by not applying weekday hours to them", () => {
    // Student sleeps in on weekends; a 10:30 Sunday session isn't judged by weekday wake time rules.
    const doc = planDoc(universityStudent, [session({ technique: "visualization", startTime: "11:30", durationMinutes: 10, days: [7] })]);
    expect(checkPlan(doc, universityStudent)).toEqual([]);
  });

  it("flags sessions that overlap each other", () => {
    const doc = planDoc(officeWorker, [
      session({ technique: "sats", startTime: "22:40", durationMinutes: 10 }),
      session({ technique: "visualization", startTime: "22:45", durationMinutes: 10, days: [1] }),
    ]);
    expect(codes(checkPlan(doc, officeWorker))).toContain("sessions_overlap");
  });

  it("checks routine style: light and hourly", () => {
    const light = planDoc(stayAtHomeParent, [
      session({ startTime: "06:10", durationMinutes: 2 }),
      session({ startTime: "10:00", durationMinutes: 2 }),
      session({ startTime: "13:10", durationMinutes: 2 }),
      session({ startTime: "20:00", durationMinutes: 2 }),
    ]);
    expect(codes(checkPlan(light, stayAtHomeParent))).toContain("style_light");
    const hourly = planDoc(hourlyPreference, [session({ startTime: "08:00" })]);
    expect(codes(checkPlan(hourly, hourlyPreference))).toContain("style_hourly");
  });

  it("copes with conflicting schedule data (overlapping activities)", () => {
    // 17:40 on Tuesday is inside both 'Late work' (no) and 'Gym' (affirmations only).
    const doc = planDoc(conflictingData, [session({ technique: "affirmations", startTime: "17:40", durationMinutes: 5, days: [2], visualizationPrompt: "" })]);
    const found = codes(checkPlan(doc, conflictingData));
    expect(found).toContain("unavailable_overlap");
    // …while Monday at the gym is fine.
    const monday = planDoc(conflictingData, [session({ technique: "affirmations", startTime: "18:05", durationMinutes: 5, days: [1], visualizationPrompt: "" })]);
    expect(codes(checkPlan(monday, conflictingData))).not.toContain("unavailable_overlap");
  });

  it("requires content for content-based techniques", () => {
    const doc = planDoc(officeWorker, [session({ technique: "sats", startTime: "22:45", durationMinutes: 10, visualizationPrompt: "" })]);
    const problems = checkPlan(doc, officeWorker);
    expect(codes(problems)).toContain("missing_content");
    expect(applyFixes(doc, problems).sessions[0].visualizationPrompt).not.toBe("");
  });
});

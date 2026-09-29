import { describe, expect, it } from "vitest";

import { GeminiRoutineGenerator } from "@/lib/ai/gemini";
import { produceInitialPlan } from "@/lib/generation/pipeline";
import { checkPlan } from "@/lib/plan/checks";
import { minutesByDay } from "@/lib/plan/schema";
import { toMinutes } from "@/lib/plan/time";

import { fixtures } from "./fixtures/users";

/**
 * Live evaluation against the real Gemini API. Opt in with:
 *   GEMINI_API_KEY=… npm run test:live
 * Each fixture goes through the full pipeline (schema, checks, repair), and
 * results are printed so a human can judge scheduling quality too.
 */

const key = process.env.GEMINI_API_KEY;
const gen = key
  ? new GeminiRoutineGenerator({ apiKey: key, model: process.env.GEMINI_MODEL || "gemini-3.8-flash", timeoutMs: 120_000 })
  : null;

describe.skipIf(!gen)("Gemini (live)", () => {
  const signatures = new Map<string, string>();

  for (const [name, snapshot] of Object.entries(fixtures)) {
    it(
      `${name}: generates a plan that passes every check`,
      async () => {
        // Free-tier keys allow ~5 requests/minute; pace the fixtures.
        await new Promise((r) => setTimeout(r, Number(process.env.LIVE_PACE_MS ?? 15000)));
        const { doc, attempts, autoFixed } = await produceInitialPlan(gen!, snapshot, { manifestationId: null });
        const problems = checkPlan(doc, snapshot).filter((p) => !p.code.startsWith("style_"));
        console.log(
          `\n=== ${name} (attempts: ${attempts}, auto-fixed: ${autoFixed.length}) — ${doc.title}\n` +
            doc.sessions
              .map((s) => `  ${s.startTime} ${String(s.durationMinutes).padStart(3)}m ${s.technique.padEnd(20)} [${s.days.join("")}] ${s.title} — ${s.fitReason}`)
              .join("\n"),
        );
        expect(problems).toEqual([]);
        expect(doc.sessions.every((s) => !snapshot.techniques.avoid.includes(s.technique))).toBe(true);
        const [, max] = snapshot.intensity.minutesPerDay;
        if (max !== null) for (const m of Object.values(minutesByDay(doc))) expect(m).toBeLessThanOrEqual(max + Math.max(2, max * 0.1));
        signatures.set(name, doc.sessions.map((s) => `${s.technique}@${Math.round(toMinutes(s.startTime) / 60)}`).sort().join("|"));
      },
      240_000,
    );
  }

  it("gives the five archetypes meaningfully different schedules", () => {
    const people = ["officeWorker", "universityStudent", "nightShiftNurse", "stayAtHomeParent", "freelancer"];
    const sigs = people.map((p) => signatures.get(p)).filter(Boolean);
    expect(new Set(sigs).size).toBe(sigs.length);
  });
});

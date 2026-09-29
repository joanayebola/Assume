import "server-only";

import { getGeminiEnv, isDemoMode } from "@/lib/env";

import { GeminiRoutineGenerator } from "./gemini";
import { GenerationError, type RoutineGenerator } from "./generator";
import { LocalRoutineGenerator } from "./local-generator";

/**
 * Gemini whenever a key is configured. Demo mode without a key uses the
 * local heuristic generator so the flow can be explored offline; anywhere
 * else a missing key is a configuration error, never a silent fallback.
 */
export function getRoutineGenerator(): RoutineGenerator {
  const gemini = getGeminiEnv();
  if (gemini) return new GeminiRoutineGenerator(gemini);
  if (isDemoMode()) return new LocalRoutineGenerator();
  throw new GenerationError("not_configured", "GEMINI_API_KEY is not set", false);
}

import "server-only";

import { ApiError, GoogleGenAI } from "@google/genai";

import { GenerationError, type RoutineGenerator } from "./generator";
import { adjustPlanPrompt, createPlanPrompt, regenerateSessionPrompt, systemInstruction } from "./prompt";
import { aiPlanSchema, aiSessionSchema, toGeminiJsonSchema } from "./schema";

/**
 * Gemini implementation of RoutineGenerator (server-only).
 *
 * Uses the official @google/genai SDK with structured output
 * (responseMimeType: application/json + responseJsonSchema). The SDK's own
 * retry loop is disabled — the generation pipeline owns retries and repair,
 * so a slow failure can't silently multiply.
 */

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

const PLAN_JSON_SCHEMA = toGeminiJsonSchema(aiPlanSchema);
const SESSION_JSON_SCHEMA = toGeminiJsonSchema(aiSessionSchema);

const MAX_TRANSIENT_ATTEMPTS = 3;

/** How long to wait before retrying, or null if the error isn't transient. */
export function retryDelayMs(error: GenerationError, attempt: number): number | null {
  if (error.code === "rate_limited") {
    // The API says how long to wait: "Please retry in 4.0s" / "retryDelay":"4s".
    const match = error.message.match(/retry in ([\d.]+)s/i) ?? error.message.match(/"retryDelay":\s*"([\d.]+)s"/);
    const seconds = match ? Number(match[1]) : 5 * attempt;
    return seconds <= 20 ? Math.ceil(seconds * 1000) + 250 : null;
  }
  if (error.code === "api_error" && /\(503\)/.test(error.message)) return attempt === 1 ? 2000 : 5000;
  return null;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

export type GeminiConfig = { apiKey: string; model: string; timeoutMs: number };

export class GeminiRoutineGenerator implements RoutineGenerator {
  readonly model: string;
  private readonly client: GoogleGenAI;
  private readonly timeoutMs: number;

  constructor(config: GeminiConfig) {
    this.model = config.model;
    this.timeoutMs = config.timeoutMs;
    this.client = new GoogleGenAI({
      apiKey: config.apiKey,
      httpOptions: { timeout: config.timeoutMs, retryOptions: { attempts: 1 } },
    });
  }

  /**
   * One logical call with bounded retries for transient capacity errors:
   * 429 (waits as long as the API asks, up to 20s) and 503 (short backoff).
   * Everything else surfaces immediately to the pipeline.
   */
  private async call(prompt: string, schema: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.callOnce(prompt, schema, signal);
      } catch (error) {
        const wait = error instanceof GenerationError ? retryDelayMs(error, attempt) : null;
        if (wait === null || attempt >= MAX_TRANSIENT_ATTEMPTS || signal?.aborted) throw error;
        await sleep(wait, signal);
      }
    }
  }

  private async callOnce(prompt: string, schema: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let text: string | undefined;
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction(),
          responseMimeType: "application/json",
          responseJsonSchema: schema,
          temperature: 0.7,
          abortSignal,
        },
      });
      const finish = String(response.candidates?.[0]?.finishReason ?? "");
      if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || finish === "BLOCKLIST") {
        throw new GenerationError("blocked", `Response blocked (${finish})`, false);
      }
      if (finish === "MAX_TOKENS") {
        throw new GenerationError("invalid_output", "Response was cut off (MAX_TOKENS)", true);
      }
      text = response.text;
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      if (timeout.aborted || (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"))) {
        throw new GenerationError("timeout", `Gemini did not respond within ${this.timeoutMs}ms`, true);
      }
      if (error instanceof ApiError) {
        if (error.status === 429) throw new GenerationError("rate_limited", error.message, true);
        if (error.status === 503) throw new GenerationError("api_error", `Gemini is overloaded (503): ${error.message}`, true);
        if (error.status === 401 || error.status === 403) {
          throw new GenerationError("not_configured", `Gemini rejected the API key (${error.status})`, false);
        }
        if (error.status === 404) throw new GenerationError("not_configured", `Unknown Gemini model "${this.model}"`, false);
        throw new GenerationError("api_error", `Gemini API error ${error.status}: ${error.message}`, error.status >= 500);
      }
      throw new GenerationError("api_error", error instanceof Error ? error.message : String(error), true);
    }

    if (!text?.trim()) throw new GenerationError("invalid_output", "Empty response", true);
    try {
      return JSON.parse(text);
    } catch {
      throw new GenerationError("invalid_output", "Response was not valid JSON", true);
    }
  }

  createPlan(input: Parameters<RoutineGenerator["createPlan"]>[0]) {
    return this.call(createPlanPrompt(input.snapshot, input.feedback), PLAN_JSON_SCHEMA, input.signal);
  }

  adjustPlan(input: Parameters<RoutineGenerator["adjustPlan"]>[0]) {
    return this.call(
      adjustPlanPrompt(input.snapshot, input.current, input.pinned, input.adjustment, input.feedback),
      PLAN_JSON_SCHEMA,
      input.signal,
    );
  }

  regenerateSession(input: Parameters<RoutineGenerator["regenerateSession"]>[0]) {
    return this.call(
      regenerateSessionPrompt(input.snapshot, input.current, input.session, input.note, input.feedback),
      SESSION_JSON_SCHEMA,
      input.signal,
    );
  }
}

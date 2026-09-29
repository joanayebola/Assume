/**
 * Server logging that never leaks what people write.
 *
 * Manifestation text, affirmations, schedules and session titles can be
 * deeply personal. Errors sometimes embed them (quoted values in validation
 * messages, Postgres "Failing row contains (…)"). In production we log only
 * the error's shape: name, code, status and a redacted, truncated message.
 * Full errors are printed in development only.
 */

const QUOTED = /("[^"]*"|“[^”]*”|'[^']{3,}'|`[^`]*`)/g;

export function redact(message: string): string {
  return message
    .replace(/Failing row contains[\s\S]*$/i, "Failing row contains [redacted]")
    .replace(/Key \([^)]*\)=\([^)]*\)/g, "Key [redacted]")
    .replace(QUOTED, "[…]")
    .slice(0, 240);
}

type Extra = Record<string, string | number | boolean | null | undefined>;

export function describeError(error: unknown) {
  if (error instanceof Error) {
    const e = error as Error & { code?: unknown; status?: unknown };
    return {
      name: e.name,
      code: typeof e.code === "string" || typeof e.code === "number" ? e.code : undefined,
      status: typeof e.status === "number" ? e.status : undefined,
      message: redact(e.message),
    };
  }
  return { name: typeof error, message: redact(String(error)) };
}

export function logError(context: string, error: unknown, extra?: Extra) {
  if (process.env.NODE_ENV === "development") {
    console.error(`[${context}]`, error, extra ?? "");
    return;
  }
  console.error(`[${context}]`, JSON.stringify({ ...describeError(error), ...extra }));
}

export function logWarn(context: string, message: string, extra?: Extra) {
  console.warn(`[${context}] ${redact(message)}`, extra ? JSON.stringify(extra) : "");
}

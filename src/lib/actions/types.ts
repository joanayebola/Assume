import type { z } from "zod";

/**
 * Shape returned by every Server Action that doesn't redirect.
 * Field errors map onto React Hook Form field names.
 */
export type ActionResult<Fields extends string = string> =
  | { ok: true; message?: string }
  | {
      ok: false;
      message: string;
      fieldErrors?: Partial<Record<Fields, string>>;
      /** Machine-readable reason when the UI can offer a specific next step. */
      reason?: string;
    };

export function fieldErrorsFrom<T extends z.ZodType>(error: z.ZodError<z.infer<T>>) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}

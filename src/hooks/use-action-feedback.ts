"use client";

import { useState } from "react";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import type { ActionResult } from "@/lib/actions/types";

/**
 * Glue between React Hook Form and our Server Actions: runs the action,
 * maps field errors back onto inputs and exposes a form-level message.
 */
export function useActionFeedback<T extends FieldValues>(setError: UseFormSetError<T>) {
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; message: string; reason?: string } | null>(null);

  async function run(action: () => Promise<ActionResult<Extract<keyof T, string>> | undefined>) {
    setFeedback(null);
    try {
      const result = await action();
      if (!result) return result;
      if (result.ok) {
        if (result.message) setFeedback({ tone: "success", message: result.message });
      } else {
        for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
          if (message) setError(field as Path<T>, { type: "server", message: message as string });
        }
        setFeedback({ tone: "error", message: result.message, reason: result.reason });
      }
      return result;
    } catch (error) {
      // redirect() from a Server Action surfaces as a thrown navigation signal —
      // let Next.js handle it.
      if (error && typeof error === "object" && "digest" in error) {
        const digest = String((error as { digest: unknown }).digest);
        if (digest.startsWith("NEXT_REDIRECT")) throw error;
      }
      console.error(error);
      setFeedback({ tone: "error", message: "We couldn't reach the server. Check your connection and try again." });
      return undefined;
    }
  }

  return { feedback, setFeedback, run };
}

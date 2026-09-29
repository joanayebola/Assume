import { generationErrorCopy, type GenerationErrorCode } from "@/lib/ai/generator";
import type { RequestStatus } from "@/lib/plan/store";

/** What the generating screen needs to know — no internals, no raw errors. */
export type GenerationStatusResponse = {
  id: string;
  kind: RequestStatus["kind"];
  status: RequestStatus["status"];
  planId: string | null;
  title: string;
  error: { code: string; message: string; canRetry: boolean } | null;
  startedAt: string | null;
  createdAt: string;
};

export const MAX_ATTEMPTS = 6;

export function presentStatus(r: RequestStatus): GenerationStatusResponse {
  const code = (r.errorCode ?? "internal") as GenerationErrorCode;
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    planId: r.planId,
    title: r.title,
    error:
      r.status === "failed"
        ? { code, message: generationErrorCopy[code] ?? generationErrorCopy.internal, canRetry: r.attempts < MAX_ATTEMPTS }
        : null,
    startedAt: r.startedAt,
    createdAt: r.createdAt,
  };
}

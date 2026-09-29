import "server-only";

import { cache } from "react";

import { requireUser } from "@/lib/auth/session";
import { getIntakeRepository } from "@/lib/intake";
import type { GenerationRequestSummary, IntakeSummary } from "@/lib/intake/model";
import { logError } from "@/lib/log";

/**
 * In-progress intakes and not-yet-built generation requests for the signed-in
 * user. Degrades to empty lists (with an error flag) rather than throwing, so
 * Home and My Plans still render if e.g. migrations haven't been applied.
 */
export const listIntakeActivity = cache(
  async (): Promise<{ drafts: IntakeSummary[]; requests: GenerationRequestSummary[]; error: boolean }> => {
    const user = await requireUser();
    try {
      const repo = await getIntakeRepository();
      const [drafts, requests] = await Promise.all([repo.listInProgress(user.id), repo.listRequests(user.id)]);
      return { drafts, requests, error: false };
    } catch (error) {
      logError("listIntakeActivity", error);
      return { drafts: [], requests: [], error: true };
    }
  },
);

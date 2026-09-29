import "server-only";

import { BURST_WINDOW_MS, type Usage } from "@/lib/entitlements";
import { getPlanStore } from "@/lib/plan";

/** Generation requests in the last day and the last few minutes (for rate limits). */
export async function generationUsage(userId: string): Promise<Usage> {
  const store = await getPlanStore();
  const now = Date.now();
  const [requestsLast24h, requestsLastBurst] = await Promise.all([
    store.countRequestsSince(userId, new Date(now - 86_400_000)),
    store.countRequestsSince(userId, new Date(now - BURST_WINDOW_MS)),
  ]);
  return { requestsLast24h, requestsLastBurst };
}

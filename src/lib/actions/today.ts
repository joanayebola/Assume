"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { isLocalDate, safeTimeZone, weekdayOf, zonedToUtc } from "@/lib/calendar/zoned";
import { getPlanStore } from "@/lib/plan";
import { routes } from "@/lib/site";
import { getCheckinStore } from "@/lib/today";
import { logError } from "@/lib/log";

export type TodayResult = { ok: true } | { ok: false; message: string };

const DAY_MS = 86_400_000;

const occurrenceSchema = z.object({
  planId: z.uuid(),
  sessionId: z.string().min(1).max(40),
  date: z.string().refine(isLocalDate),
});

const updateSchema = occurrenceSchema.extend({
  status: z.enum(["done", "skipped"]).nullable(),
  /** ISO instant for "Move today"; null clears a move. */
  movedTo: z.iso.datetime({ offset: true }).nullable(),
});

/**
 * Done / Skip / Move for one occurrence. Both fields are always sent, so the
 * client's optimistic state and the server can't drift apart.
 */
export async function updateOccurrence(raw: z.input<typeof updateSchema>): Promise<TodayResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Your session has expired. Log in again." };
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "That session couldn't be updated." };
  const { planId, sessionId, date, status, movedTo } = parsed.data;

  try {
    const plan = await (await getPlanStore()).getPlan(user.id, planId);
    const session = plan?.doc.sessions.find((s) => s.id === sessionId);
    if (!plan || !session || !session.days.includes(weekdayOf(date))) {
      return { ok: false, message: "This session has changed. Refresh to see the latest." };
    }
    if (movedTo) {
      // "Move today" only nudges this one occurrence, within a day of its slot.
      const original = zonedToUtc(date, session.startTime, safeTimeZone(plan.doc.timezone));
      if (Math.abs(Date.parse(movedTo) - original) > DAY_MS) return { ok: false, message: "Pick a time today." };
    }
    await (await getCheckinStore()).save(user.id, {
      planId,
      sessionId,
      date,
      status,
      movedTo: movedTo ? new Date(movedTo).toISOString() : null,
    });
    revalidatePath(routes.appHome);
    return { ok: true };
  } catch (error) {
    logError("today", error);
    return { ok: false, message: "That didn't save. Check your connection and try again." };
  }
}

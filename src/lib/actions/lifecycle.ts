"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getCalendarStore } from "@/lib/calendar";
import { removePlanFromGoogle } from "@/lib/calendar/service";
import { isLocalDate } from "@/lib/calendar/zoned";
import { getPlanStore } from "@/lib/plan";
import { PlanNotFoundError, type LifecycleStatus } from "@/lib/plan/store";
import { routes } from "@/lib/site";
import { logError } from "@/lib/log";
import { track } from "@/lib/analytics/server";

export type LifecycleResult<T = object> =
  | ({ ok: true; warning?: string } & T)
  | { ok: false; code: "auth" | "not_found" | "invalid" | "error"; message: string };

const uuid = z.uuid();
const SESSION_EXPIRED = { ok: false, code: "auth", message: "Your session has expired. Log in again." } as const;
const NOT_FOUND = { ok: false, code: "not_found", message: "We couldn't find this routine." } as const;

const CALENDAR_WARNING =
  "We couldn't remove its events from Google Calendar just now. You can remove them from the plan page later, or delete them in Google Calendar.";

function failure(error: unknown, context: string): Extract<LifecycleResult, { ok: false }> {
  if (error instanceof PlanNotFoundError) return NOT_FOUND;
  logError(`lifecycle:${context}`, error);
  return { ok: false, code: "error", message: "That didn't save. Please try again." };
}

function refresh(planId?: string) {
  revalidatePath(routes.appHome);
  revalidatePath(routes.plans);
  if (planId) revalidatePath(`${routes.plans}/${planId}`);
}

/** Removes Google events if asked. Returns a warning instead of failing the main action. */
async function maybeRemoveFromCalendar(userId: string, planId: string, remove: boolean): Promise<string | undefined> {
  if (!remove) return undefined;
  try {
    await removePlanFromGoogle(await getCalendarStore(), userId, planId);
    return undefined;
  } catch (error) {
    logError("lifecycle:calendar", error);
    return CALENDAR_WARNING;
  }
}

async function setStatus(planId: string, status: LifecycleStatus, removeFromCalendar = false): Promise<LifecycleResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  if (!uuid.safeParse(planId).success) return NOT_FOUND;
  try {
    const store = await getPlanStore();
    if (!(await store.getPlan(user.id, planId))) return NOT_FOUND;
    const warning = await maybeRemoveFromCalendar(user.id, planId, removeFromCalendar);
    await store.setStatus(user.id, planId, status);
    refresh(planId);
    return { ok: true, warning };
  } catch (error) {
    return failure(error, status);
  }
}

export async function pausePlan(planId: string, removeFromCalendar: boolean) {
  return setStatus(planId, "paused", removeFromCalendar);
}

export async function resumePlan(planId: string) {
  return setStatus(planId, "active");
}

export async function archivePlan(planId: string, removeFromCalendar: boolean) {
  return setStatus(planId, "archived", removeFromCalendar);
}

export async function restorePlan(planId: string) {
  return setStatus(planId, "active");
}

export async function completePlan(planId: string, removeFromCalendar: boolean) {
  const result = await setStatus(planId, "completed", removeFromCalendar);
  if (result.ok) {
    const user = await getCurrentUser();
    if (user) track("manifestation_completed", user.id);
  }
  return result;
}

export async function duplicatePlan(planId: string): Promise<LifecycleResult<{ planId: string }>> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  if (!uuid.safeParse(planId).success) return NOT_FOUND;
  try {
    const id = await (await getPlanStore()).duplicatePlan(user.id, planId);
    refresh();
    return { ok: true, planId: id };
  } catch (error) {
    return failure(error, "duplicate");
  }
}

export async function deletePlan(planId: string, removeFromCalendar: boolean): Promise<LifecycleResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  if (!uuid.safeParse(planId).success) return NOT_FOUND;
  try {
    const store = await getPlanStore();
    if (!(await store.getPlan(user.id, planId))) return NOT_FOUND;
    // Calendar links are deleted with the plan, so clean up Google first.
    const warning = await maybeRemoveFromCalendar(user.id, planId, removeFromCalendar);
    await store.deletePlan(user.id, planId);
    refresh();
    return { ok: true, warning };
  } catch (error) {
    return failure(error, "delete");
  }
}

// ---------------------------------------------------------------------------
// Manifested archive
// ---------------------------------------------------------------------------

const archiveEntrySchema = z.object({
  note: z.string().trim().max(1000, { error: "Keep it under 1,000 characters." }),
  manifestedOn: z.string().refine(isLocalDate, { error: "Pick a date." }),
});

export async function saveToManifestedArchive(planId: string, raw: unknown): Promise<LifecycleResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  if (!uuid.safeParse(planId).success) return NOT_FOUND;
  const parsed = archiveEntrySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "invalid", message: parsed.error.issues[0]?.message ?? "Check the details." };
  try {
    const store = await getPlanStore();
    const plan = await store.getPlan(user.id, planId);
    if (!plan) return NOT_FOUND;
    const entry = await store.addManifested(user.id, {
      planId,
      title: plan.doc.title,
      desire: plan.doc.manifestation.desire || plan.doc.title,
      note: parsed.data.note || null,
      manifestedOn: parsed.data.manifestedOn,
    });
    revalidatePath(routes.manifested);
    return { ok: true, id: entry.id };
  } catch (error) {
    return failure(error, "archive");
  }
}

export async function removeFromManifestedArchive(entryId: string): Promise<LifecycleResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  if (!uuid.safeParse(entryId).success) return NOT_FOUND;
  try {
    await (await getPlanStore()).deleteManifested(user.id, entryId);
    revalidatePath(routes.manifested);
    return { ok: true };
  } catch (error) {
    return failure(error, "archive:remove");
  }
}

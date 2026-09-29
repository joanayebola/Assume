"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getCalendarStore } from "@/lib/calendar";
import { disconnectGoogle } from "@/lib/calendar/service";
import { mutateDemo } from "@/lib/demo/store";
import { getGoogleCalendarEnv, isDemoMode } from "@/lib/env";
import { logError } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type DeleteAccountResult = { ok: false; message: string };

/**
 * Permanently deletes the account and everything in it.
 *
 * Deleting the auth user cascades (via profiles) to manifestations, intakes,
 * plans, versions, check-ins, calendar data, entitlements and the archive.
 * Purchase records are kept without any link to the person (payment records
 * usually must be retained — confirm the retention period in legal review).
 * Google access is revoked first; optionally the Assume calendar is deleted.
 */
export async function deleteAccount(confirmation: string, removeGoogleCalendar: boolean): Promise<DeleteAccountResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Your session has expired. Log in again." };
  if (confirmation.trim().toUpperCase() !== "DELETE") return { ok: false, message: "Type DELETE to confirm." };

  if (getGoogleCalendarEnv()) {
    try {
      await disconnectGoogle(await getCalendarStore(), user.id, Boolean(removeGoogleCalendar));
    } catch (error) {
      logError("account:delete:google", error);
    }
  }

  if (isDemoMode()) {
    await mutateDemo((s) => {
      const mine = <T extends { userId: string | null }>(rows: T[]) => rows.filter((r) => r.userId !== user.id);
      for (const [id, x] of Object.entries(s.intakes)) if (x.userId === user.id) delete s.intakes[id];
      for (const [id, x] of Object.entries(s.requests)) if (x.userId === user.id) delete s.requests[id];
      for (const [id, x] of Object.entries(s.plans)) if (x.userId === user.id) delete s.plans[id];
      s.versions = mine(s.versions);
      s.calendarExports = mine(s.calendarExports);
      s.connections = mine(s.connections);
      s.eventLinks = mine(s.eventLinks);
      s.checkins = mine(s.checkins);
      s.manifested = mine(s.manifested);
      s.grants = mine(s.grants);
      for (const p of s.purchases) if (p.userId === user.id) p.userId = null;
      delete s.calendarPreferences[user.id];
      delete s.intakeDefaults[user.id];
    });
    redirect("/?account=deleted");
  }

  const admin = createAdminClient();
  if (!admin) {
    logError("account:delete", new Error("SUPABASE_SECRET_KEY is not set"));
    return { ok: false, message: "Account deletion isn't available right now. Please contact support and we'll do it for you." };
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    logError("account:delete", error);
    return { ok: false, message: "We couldn't delete your account. Nothing was removed — please try again or contact support." };
  }
  try {
    await (await createClient()).auth.signOut();
  } catch {
    // The user no longer exists; clearing cookies is best effort.
  }
  redirect("/?account=deleted");
}

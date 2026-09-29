"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getViewer } from "@/lib/auth/session";
import { getBillingStore } from "@/lib/billing";
import { DodoError } from "@/lib/billing/dodo";
import { CheckoutLimitError, startCheckout } from "@/lib/billing/service";
import { BillingNotConfiguredError } from "@/lib/billing/store";
import { logError } from "@/lib/log";

export type CheckoutResult = { ok: false; message: string };

/** Starts a checkout for a routine and sends the browser to the payment page. */
export async function beginCheckout(rawIntakeId: string | null): Promise<CheckoutResult> {
  const viewer = await getViewer();
  const intake = rawIntakeId ? z.uuid().safeParse(rawIntakeId) : null;
  if (intake && !intake.success) return { ok: false, message: "We couldn't find that plan." };

  let url: string;
  try {
    ({ url } = await startCheckout(await getBillingStore(), {
      userId: viewer.user.id,
      email: viewer.user.email ?? null,
      name: viewer.profile.display_name,
      productKey: "routine",
      intakeId: intake?.data ?? null,
    }));
  } catch (error) {
    if (error instanceof CheckoutLimitError) {
      return { ok: false, message: "You've started a lot of checkouts in the last hour. Please try again a little later." };
    }
    if (error instanceof BillingNotConfiguredError) return { ok: false, message: "Purchases aren't switched on yet. Please check back soon." };
    logError("billing:checkout", error);
    return {
      ok: false,
      message:
        error instanceof DodoError
          ? "The payment provider didn't respond. You haven't been charged — please try again."
          : "We couldn't start checkout. You haven't been charged — please try again.",
    };
  }
  redirect(url);
}

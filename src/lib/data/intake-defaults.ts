import "server-only";

import { loadDemo, mutateDemo } from "@/lib/demo/store";
import { isDemoMode } from "@/lib/env";
import { EMPTY_INTAKE_DEFAULTS, parseIntakeDefaults, type IntakeDefaults } from "@/lib/intake/defaults";
import { logError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export async function getIntakeDefaults(userId: string): Promise<IntakeDefaults> {
  try {
    if (isDemoMode()) return parseIntakeDefaults((await loadDemo()).intakeDefaults[userId]);
    const { data, error } = await (await createClient()).from("profiles").select("intake_defaults").eq("id", userId).maybeSingle();
    if (error) throw error;
    return parseIntakeDefaults(data?.intake_defaults);
  } catch (error) {
    logError("intake-defaults:get", error);
    return EMPTY_INTAKE_DEFAULTS;
  }
}

export async function saveIntakeDefaults(userId: string, defaults: IntakeDefaults): Promise<void> {
  if (isDemoMode()) {
    await mutateDemo((s) => {
      s.intakeDefaults[userId] = defaults;
    });
    return;
  }
  const { error } = await (await createClient())
    .from("profiles")
    .update({ intake_defaults: defaults as unknown as Json })
    .eq("id", userId);
  if (error) throw new Error(`[intake-defaults] ${error.message}`);
}

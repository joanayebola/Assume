import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadDemo, mutateDemo, withoutUser } from "@/lib/demo/store";
import { isDemoMode } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

import type { Checkin, CheckinStore } from "./store";

class DemoCheckinStore implements CheckinStore {
  async list(userId: string, fromDate: string, toDate: string) {
    return (await loadDemo()).checkins
      .filter((c) => c.userId === userId && c.date >= fromDate && c.date <= toDate)
      .map(withoutUser);
  }

  async save(userId: string, c: Checkin) {
    await mutateDemo((s) => {
      const plan = s.plans[c.planId];
      if (!plan || plan.userId !== userId) throw new Error("plan not found");
      const same = (x: Checkin) => x.planId === c.planId && x.sessionId === c.sessionId && x.date === c.date;
      s.checkins = s.checkins.filter((x) => !same(x));
      if (c.status || c.movedTo) s.checkins.push({ ...c, userId });
    });
  }
}

class SupabaseCheckinStore implements CheckinStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async list(userId: string, fromDate: string, toDate: string) {
    const { data, error } = await this.db
      .from("session_checkins")
      .select("plan_id, session_id, occurrence_date, status, moved_to")
      .eq("user_id", userId)
      .gte("occurrence_date", fromDate)
      .lte("occurrence_date", toDate);
    if (error) throw new Error(`[checkins:list] ${error.message}`);
    return data.map((r) => ({
      planId: r.plan_id,
      sessionId: r.session_id,
      date: r.occurrence_date,
      status: r.status,
      movedTo: r.moved_to ? new Date(r.moved_to).toISOString() : null,
    }));
  }

  async save(userId: string, c: Checkin) {
    const match = { user_id: userId, plan_id: c.planId, session_id: c.sessionId, occurrence_date: c.date };
    if (!c.status && !c.movedTo) {
      const { error } = await this.db.from("session_checkins").delete().match(match);
      if (error) throw new Error(`[checkins:clear] ${error.message}`);
      return;
    }
    const { error } = await this.db
      .from("session_checkins")
      .upsert({ ...match, status: c.status, moved_to: c.movedTo }, { onConflict: "plan_id,session_id,occurrence_date" });
    if (error) throw new Error(`[checkins:save] ${error.message}`);
  }
}

export async function getCheckinStore(): Promise<CheckinStore> {
  if (isDemoMode()) return new DemoCheckinStore();
  return new SupabaseCheckinStore(await createClient());
}

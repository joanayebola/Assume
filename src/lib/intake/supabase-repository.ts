import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json, Tables } from "@/types/database";

import {
  OVERLAP_TECHNIQUES,
  emptySections,
  titleFromDesire,
  type GenerationRequestSummary,
  type IntakeDraft,
  type IntakeSections,
  type IntakeSummary,
  type OverlapTechnique,
  type SectionKey,
  type Weekday,
} from "./model";
import { IntakeLockedError, IntakeNotFoundError, type IntakeRepository, type Progress } from "./repository";
import type { IntakeSnapshotV2 } from "./snapshot";

type Client = SupabaseClient<Database>;

/** Postgres `time` comes back as "HH:MM:SS"; the UI works in "HH:MM". */
const toHHMM = (t: string | null) => (t ? t.slice(0, 5) : "");
const blankToNull = (s: string) => (s.trim() ? s : null);
const isOverlapTechnique = (t: string): t is OverlapTechnique =>
  (OVERLAP_TECHNIQUES as readonly string[]).includes(t);

function fail(context: string, error: { message: string; code?: string } | null): never {
  if (error?.code === "P0002") throw new IntakeNotFoundError();
  if (error?.code === "P0001") throw new IntakeLockedError();
  throw new Error(`[intake:${context}] ${error?.message ?? "unknown error"}`);
}

export class SupabaseIntakeRepository implements IntakeRepository {
  constructor(private readonly db: Client) {}

  async listInProgress(userId: string): Promise<IntakeSummary[]> {
    const { data, error } = await this.db
      .from("manifestation_intakes")
      .select("id, manifestation_id, current_step, completed_steps, updated_at")
      .eq("user_id", userId)
      .eq("status", "in_progress")
      .order("updated_at", { ascending: false })
      .limit(10);
    if (error) fail("list", error);

    const titles = await this.titlesFor(data.map((r) => r.manifestation_id));
    return data.map((r) => ({
      id: r.id,
      title: r.manifestation_id ? (titles.get(r.manifestation_id) ?? null) : null,
      currentStep: r.current_step,
      completedCount: r.completed_steps.filter((s) => s !== "review").length,
      updatedAt: r.updated_at,
    }));
  }

  async create(userId: string): Promise<string> {
    const { data, error } = await this.db
      .from("manifestation_intakes")
      .insert({ user_id: userId })
      .select("id")
      .single();
    if (error) fail("create", error);
    return data.id;
  }

  async get(userId: string, intakeId: string): Promise<IntakeDraft | null> {
    const { data: intake, error } = await this.db
      .from("manifestation_intakes")
      .select("*")
      .eq("id", intakeId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) fail("get", error);
    if (!intake) return null;

    const mId = intake.manifestation_id;
    const [manifestation, schedule, commitments, techniques, affirmations, request] = await Promise.all([
      mId
        ? this.db.from("manifestations").select("*").eq("id", mId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      this.db.from("schedule_preferences").select("*").eq("intake_id", intakeId).maybeSingle(),
      this.db.from("recurring_commitments").select("*").eq("intake_id", intakeId).order("position"),
      this.db.from("technique_preferences").select("*").eq("intake_id", intakeId),
      mId
        ? this.db
            .from("affirmations")
            .select("*")
            .eq("manifestation_id", mId)
            .eq("source", "user")
            .order("position")
        : Promise.resolve({ data: [] as Tables<"affirmations">[], error: null }),
      this.db
        .from("plan_generation_requests")
        .select("id")
        .eq("intake_id", intakeId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    for (const r of [manifestation, schedule, commitments, techniques, affirmations, request]) {
      if (r.error) fail("get:children", r.error);
    }

    const m = manifestation.data;
    const s = schedule.data;
    const base = emptySections();

    return {
      id: intake.id,
      status: intake.status,
      currentStep: intake.current_step,
      completedSteps: intake.completed_steps,
      updatedAt: intake.updated_at,
      requestId: request.data?.id ?? null,
      desire: {
        desire: m?.desire ?? "",
        desiredEnd: m?.desired_end ?? "",
        circumstances: m?.circumstances ?? "",
      },
      affirmations: {
        mode: intake.affirmation_mode,
        items: (affirmations.data ?? []).map((a) => ({ id: a.id, text: a.text })),
      },
      methods: {
        unsure: intake.methods_unsure,
        preferences: (techniques.data ?? []).map((t) => ({ technique: t.technique, preference: t.preference })),
        otherLabel: intake.other_technique_label ?? "",
      },
      day: s
        ? {
            wakeTime: toHHMM(s.wake_time),
            sleepTime: toHHMM(s.sleep_time),
            typicalDay: s.typical_day ?? "",
            commitments: (commitments.data ?? []).map((c) => ({
              id: c.id,
              kind: c.kind,
              label: c.label,
              weekdays: c.weekdays as Weekday[],
              start: toHHMM(c.start_time),
              end: toHHMM(c.end_time),
              overlap: c.manifestation_overlap,
              overlapTechniques: c.overlap_techniques.filter(isOverlapTechnique),
              overlapOtherLabel: c.overlap_other_label ?? "",
            })),
            weekendsDifferent: s.weekends_different,
            weekendDescription: s.weekend_description ?? "",
          }
        : base.day,
      intensity: {
        timeBudget: intake.time_budget,
        customMinutes: intake.custom_minutes,
        style: intake.routine_style,
        styleNote: intake.routine_style_note ?? "",
        quietTimes: intake.quiet_times ?? "",
      },
      context: {
        hasRelevantDate: intake.has_relevant_date,
        relevantDate: m?.relevant_date ?? "",
        notes: intake.additional_notes ?? "",
      },
    };
  }

  async saveSection<K extends SectionKey>(userId: string, intakeId: string, key: K, data: IntakeSections[K]) {
    const intake = await this.editableIntake(userId, intakeId);

    switch (key) {
      case "desire": {
        const d = data as IntakeSections["desire"];
        const fields = {
          title: titleFromDesire(d.desire) ?? "Untitled manifestation",
          desire: d.desire,
          desired_end: blankToNull(d.desiredEnd),
          circumstances: blankToNull(d.circumstances),
        };
        if (intake.manifestation_id) {
          const { error } = await this.db.from("manifestations").update(fields).eq("id", intake.manifestation_id);
          if (error) fail("save:desire", error);
          await this.touch(intakeId);
        } else if (d.desire.trim() || d.desiredEnd.trim() || d.circumstances.trim()) {
          await this.createManifestation(userId, intakeId, fields);
        }
        return;
      }
      case "affirmations": {
        const d = data as IntakeSections["affirmations"];
        const { error } = await this.db
          .from("manifestation_intakes")
          .update({ affirmation_mode: d.mode })
          .eq("id", intakeId);
        if (error) fail("save:affirmations", error);
        const mId = intake.manifestation_id ?? (await this.createManifestation(userId, intakeId));
        const items = d.items.map((i) => ({ text: i.text })) satisfies Json;
        const rpc = await this.db.rpc("replace_manifestation_affirmations", {
          p_manifestation_id: mId,
          p_items: items,
        });
        if (rpc.error) fail("save:affirmations:list", rpc.error);
        return;
      }
      case "methods": {
        const d = data as IntakeSections["methods"];
        const { error } = await this.db
          .from("manifestation_intakes")
          .update({ methods_unsure: d.unsure, other_technique_label: blankToNull(d.otherLabel) })
          .eq("id", intakeId);
        if (error) fail("save:methods", error);
        const rpc = await this.db.rpc("replace_intake_techniques", {
          p_intake_id: intakeId,
          p_items: d.preferences satisfies Json,
        });
        if (rpc.error) fail("save:methods:list", rpc.error);
        return;
      }
      case "day": {
        const d = data as IntakeSections["day"];
        const { error } = await this.db.from("schedule_preferences").upsert(
          {
            intake_id: intakeId,
            user_id: userId,
            wake_time: d.wakeTime || null,
            sleep_time: d.sleepTime || null,
            typical_day: blankToNull(d.typicalDay),
            weekends_different: d.weekendsDifferent,
            weekend_description: blankToNull(d.weekendDescription),
          },
          { onConflict: "intake_id" },
        );
        if (error) fail("save:day", error);
        const items = d.commitments.map((c) => ({
          kind: c.kind,
          // The label column requires 1+ chars; fall back while the user is typing.
          label: c.label.trim() || c.kind,
          weekdays: c.weekdays,
          start: c.start,
          end: c.end,
          overlap: c.overlap,
          overlapTechniques: c.overlap === "some" ? c.overlapTechniques : [],
          overlapOtherLabel: c.overlap === "some" ? c.overlapOtherLabel : "",
        })) satisfies Json;
        const rpc = await this.db.rpc("replace_intake_commitments", { p_intake_id: intakeId, p_items: items });
        if (rpc.error) fail("save:day:list", rpc.error);
        await this.touch(intakeId);
        return;
      }
      case "intensity": {
        const d = data as IntakeSections["intensity"];
        const { error } = await this.db
          .from("manifestation_intakes")
          .update({
            time_budget: d.timeBudget,
            custom_minutes: d.customMinutes,
            routine_style: d.style,
            routine_style_note: blankToNull(d.styleNote),
            quiet_times: blankToNull(d.quietTimes),
          })
          .eq("id", intakeId);
        if (error) fail("save:intensity", error);
        return;
      }
      case "context": {
        const d = data as IntakeSections["context"];
        const { error } = await this.db
          .from("manifestation_intakes")
          .update({ has_relevant_date: d.hasRelevantDate, additional_notes: blankToNull(d.notes) })
          .eq("id", intakeId);
        if (error) fail("save:context", error);
        const mId = intake.manifestation_id ?? (await this.createManifestation(userId, intakeId));
        const m = await this.db
          .from("manifestations")
          .update({ relevant_date: d.hasRelevantDate && d.relevantDate ? d.relevantDate : null })
          .eq("id", mId);
        if (m.error) fail("save:context:date", m.error);
        return;
      }
    }
  }

  async saveProgress(userId: string, intakeId: string, progress: Progress) {
    await this.editableIntake(userId, intakeId);
    const { error } = await this.db
      .from("manifestation_intakes")
      .update({ current_step: progress.currentStep, completed_steps: progress.completedSteps })
      .eq("id", intakeId);
    if (error) fail("progress", error);
  }

  async submit(_userId: string, intakeId: string, snapshot: IntakeSnapshotV2) {
    const { data, error } = await this.db.rpc("submit_manifestation_intake", {
      p_intake_id: intakeId,
      p_snapshot: snapshot as unknown as Json,
    });
    if (error) fail("submit", error);
    return data;
  }

  async archive(userId: string, intakeId: string) {
    const { error } = await this.db
      .from("manifestation_intakes")
      .update({ status: "archived" })
      .eq("id", intakeId)
      .eq("user_id", userId)
      .eq("status", "in_progress");
    if (error) fail("archive", error);
  }

  async getRequest(userId: string, requestId: string): Promise<GenerationRequestSummary | null> {
    const { data, error } = await this.db
      .from("plan_generation_requests")
      .select("id, intake_id, manifestation_id, status, plan_id, created_at")
      .eq("id", requestId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) fail("request", error);
    if (!data) return null;
    const titles = await this.titlesFor([data.manifestation_id]);
    return {
      id: data.id,
      intakeId: data.intake_id,
      title: titles.get(data.manifestation_id) ?? "Your manifestation",
      status: data.status,
      planId: data.plan_id,
      createdAt: data.created_at,
    };
  }

  async listRequests(userId: string): Promise<GenerationRequestSummary[]> {
    const { data, error } = await this.db
      .from("plan_generation_requests")
      .select("id, intake_id, manifestation_id, status, plan_id, created_at")
      .eq("user_id", userId)
      .eq("kind", "initial")
      .in("status", ["queued", "processing", "failed"])
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) fail("requests", error);
    const titles = await this.titlesFor(data.map((r) => r.manifestation_id));
    return data.map((r) => ({
      id: r.id,
      intakeId: r.intake_id,
      title: titles.get(r.manifestation_id) ?? "Your manifestation",
      status: r.status,
      planId: r.plan_id,
      createdAt: r.created_at,
    }));
  }

  // --- helpers ---------------------------------------------------------------

  private async editableIntake(userId: string, intakeId: string) {
    const { data, error } = await this.db
      .from("manifestation_intakes")
      .select("id, status, manifestation_id")
      .eq("id", intakeId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) fail("lookup", error);
    if (!data) throw new IntakeNotFoundError();
    if (data.status !== "in_progress") throw new IntakeLockedError();
    return data;
  }

  private async createManifestation(
    userId: string,
    intakeId: string,
    fields: { title: string; desire: string; desired_end?: string | null; circumstances?: string | null } = {
      title: "Untitled manifestation",
      desire: "",
    },
  ) {
    const { data, error } = await this.db
      .from("manifestations")
      .insert({ user_id: userId, ...fields })
      .select("id")
      .single();
    if (error) fail("manifestation:create", error);
    const link = await this.db
      .from("manifestation_intakes")
      .update({ manifestation_id: data.id })
      .eq("id", intakeId);
    if (link.error) fail("manifestation:link", link.error);
    return data.id;
  }

  private async touch(intakeId: string) {
    await this.db
      .from("manifestation_intakes")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", intakeId);
  }

  private async titlesFor(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const map = new Map<string, string>();
    if (unique.length === 0) return map;
    const { data } = await this.db.from("manifestations").select("id, title, desire").in("id", unique);
    for (const m of data ?? []) map.set(m.id, m.desire.trim() ? m.title : "");
    return map;
  }
}

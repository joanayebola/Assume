/**
 * Database types for the Supabase client.
 *
 * Mirrors supabase/migrations. Once your project is linked you can regenerate
 * this file with:  npm run db:types
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamps = { created_at: string; updated_at: string };
type OptionalTimestamps = { created_at?: string; updated_at?: string };

type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  timezone: string;
  onboarding_completed_at: string | null;
  calendar_preferences: Json | null;
  intake_defaults: Json | null;
} & Timestamps;

type ManifestationRow = {
  id: string;
  user_id: string;
  title: string;
  desire: string;
  circumstances: string | null;
  desired_end: string | null;
  relevant_date: string | null;
  status: Enums<"manifestation_status">;
} & Timestamps;

type PlanRow = {
  id: string;
  user_id: string;
  manifestation_id: string | null;
  intake_id: string | null;
  title: string;
  status: Enums<"plan_status">;
  structure: Enums<"routine_style">;
  daily_minutes: number | null;
  timezone: string;
  intake: Json;
  intake_version: number;
  routine: Json | null;
  routine_version: number;
  generation_model: string | null;
  generated_at: string | null;
  current_version: number;
  paused_at: string | null;
  completed_at: string | null;
  archived_at: string | null;
} & Timestamps;

type IntakeRow = {
  id: string;
  user_id: string;
  manifestation_id: string | null;
  status: Enums<"intake_status">;
  current_step: Enums<"intake_step">;
  completed_steps: Enums<"intake_step">[];
  affirmation_mode: Enums<"affirmation_mode"> | null;
  methods_unsure: boolean;
  other_technique_label: string | null;
  time_budget: Enums<"time_budget"> | null;
  custom_minutes: number | null;
  routine_style: Enums<"routine_style"> | null;
  routine_style_note: string | null;
  quiet_times: string | null;
  has_relevant_date: boolean | null;
  additional_notes: string | null;
  submitted_at: string | null;
} & Timestamps;

type ScheduleRow = {
  intake_id: string;
  user_id: string;
  wake_time: string | null;
  sleep_time: string | null;
  typical_day: string | null;
  weekends_different: boolean | null;
  weekend_description: string | null;
} & Timestamps;

type CommitmentRow = {
  id: string;
  intake_id: string;
  user_id: string;
  kind: Enums<"commitment_kind">;
  label: string;
  weekdays: number[];
  start_time: string | null;
  end_time: string | null;
  position: number;
  manifestation_overlap: Enums<"overlap_availability"> | null;
  overlap_techniques: Enums<"technique">[];
  overlap_other_label: string | null;
} & Timestamps;

type TechniquePreferenceRow = {
  id: string;
  intake_id: string;
  user_id: string;
  technique: Enums<"technique">;
  preference: Enums<"technique_preference">;
  created_at: string;
};

type AffirmationRow = {
  id: string;
  manifestation_id: string;
  user_id: string;
  text: string;
  position: number;
  source: Enums<"affirmation_source">;
} & Timestamps;

type GenerationRequestRow = {
  id: string;
  user_id: string;
  intake_id: string;
  manifestation_id: string;
  plan_id: string | null;
  status: Enums<"generation_status">;
  input_snapshot: Json;
  snapshot_version: number;
  attempts: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  kind: Enums<"generation_kind">;
  params: Json;
  base_version: number | null;
  result_version_id: string | null;
  model: string | null;
  error_code: string | null;
} & Timestamps;

type PlanVersionRow = {
  id: string;
  plan_id: string;
  user_id: string;
  version: number;
  document: Json;
  source: Enums<"plan_version_source">;
  summary: string | null;
  generation_request_id: string | null;
  model: string | null;
} & Timestamps;

type CalendarExportRow = {
  id: string;
  user_id: string;
  plan_id: string;
  provider: Enums<"calendar_provider">;
  options: Json;
  fingerprint: string;
  plan_version: number;
  event_count: number;
  export_count: number;
  last_exported_at: string;
} & Timestamps;

type CalendarConnectionRow = {
  id: string;
  user_id: string;
  provider: Enums<"calendar_provider">;
  status: Enums<"calendar_connection_status">;
  calendar_id: string | null;
  calendar_name: string | null;
  scope: string;
  last_error: string | null;
  connected_at: string;
} & Timestamps;

type CalendarConnectionSecretRow = {
  connection_id: string;
  user_id: string;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  updated_at: string;
};

type CalendarEventLinkRow = {
  id: string;
  user_id: string;
  plan_id: string;
  connection_id: string;
  provider: Enums<"calendar_provider">;
  session_id: string;
  external_event_id: string;
  fingerprint: string;
  synced_at: string;
};

type SessionCheckinRow = {
  id: string;
  user_id: string;
  plan_id: string;
  session_id: string;
  occurrence_date: string;
  status: Enums<"checkin_status"> | null;
  moved_to: string | null;
} & Timestamps;

type ManifestedEntryRow = {
  id: string;
  user_id: string;
  plan_id: string | null;
  title: string;
  desire: string;
  note: string | null;
  manifested_on: string;
} & Timestamps;

type PurchaseRow = {
  id: string;
  user_id: string | null;
  provider: string;
  product_key: string;
  provider_product_id: string;
  checkout_session_id: string | null;
  provider_payment_id: string | null;
  intake_id: string | null;
  status: Enums<"purchase_status">;
  amount: number | null;
  currency: string | null;
  paid_at: string | null;
  refunded_at: string | null;
} & Timestamps;

type EntitlementGrantRow = {
  id: string;
  user_id: string;
  kind: Enums<"grant_kind">;
  status: Enums<"grant_status">;
  purchase_id: string | null;
  request_id: string | null;
  reserved_at: string | null;
  consumed_at: string | null;
  valid_until: string | null;
  provider_subscription_id: string | null;
} & Timestamps;

type WebhookEventRow = {
  id: string;
  provider: string;
  type: string;
  received_at: string;
  processed_at: string | null;
};

/** Insert = required keys of Row minus defaults; Update = everything optional. */
type Table<Row, Required extends keyof Row, Rel = []> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required>> & OptionalTimestamps;
  Update: Partial<Row>;
  Relationships: Rel;
};

type Fk<Name extends string, Col extends string, Ref extends string> = {
  foreignKeyName: Name;
  columns: [Col];
  isOneToOne: false;
  referencedRelation: Ref;
  referencedColumns: ["id"];
};

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13.0.5";
  };
  public: {
    Tables: {
      profiles: Table<ProfileRow, "id">;
      manifestations: Table<
        ManifestationRow,
        "user_id" | "title" | "desire",
        [Fk<"manifestations_user_id_fkey", "user_id", "profiles">]
      >;
      plans: Table<
        PlanRow,
        "user_id" | "title",
        [
          Fk<"plans_user_id_fkey", "user_id", "profiles">,
          Fk<"plans_manifestation_id_fkey", "manifestation_id", "manifestations">,
          Fk<"plans_intake_id_fkey", "intake_id", "manifestation_intakes">,
        ]
      >;
      manifestation_intakes: Table<
        IntakeRow,
        "user_id",
        [
          Fk<"manifestation_intakes_user_id_fkey", "user_id", "profiles">,
          Fk<"manifestation_intakes_manifestation_id_fkey", "manifestation_id", "manifestations">,
        ]
      >;
      schedule_preferences: Table<
        ScheduleRow,
        "intake_id" | "user_id",
        [Fk<"schedule_preferences_intake_id_fkey", "intake_id", "manifestation_intakes">]
      >;
      recurring_commitments: Table<
        CommitmentRow,
        "intake_id" | "user_id" | "kind" | "label",
        [Fk<"recurring_commitments_intake_id_fkey", "intake_id", "manifestation_intakes">]
      >;
      technique_preferences: Table<
        TechniquePreferenceRow,
        "intake_id" | "user_id" | "technique" | "preference",
        [Fk<"technique_preferences_intake_id_fkey", "intake_id", "manifestation_intakes">]
      >;
      affirmations: Table<
        AffirmationRow,
        "manifestation_id" | "user_id" | "text",
        [Fk<"affirmations_manifestation_id_fkey", "manifestation_id", "manifestations">]
      >;
      plan_versions: Table<
        PlanVersionRow,
        "plan_id" | "user_id" | "version" | "document" | "source",
        [Fk<"plan_versions_plan_id_fkey", "plan_id", "plans">]
      >;
      plan_generation_requests: Table<
        GenerationRequestRow,
        "user_id" | "intake_id" | "manifestation_id" | "input_snapshot",
        [
          Fk<"plan_generation_requests_intake_id_fkey", "intake_id", "manifestation_intakes">,
          Fk<"plan_generation_requests_manifestation_id_fkey", "manifestation_id", "manifestations">,
          Fk<"plan_generation_requests_plan_id_fkey", "plan_id", "plans">,
        ]
      >;
      calendar_exports: Table<
        CalendarExportRow,
        "user_id" | "plan_id" | "provider" | "options" | "fingerprint" | "plan_version" | "event_count",
        [Fk<"calendar_exports_plan_id_fkey", "plan_id", "plans">]
      >;
      calendar_connections: Table<
        CalendarConnectionRow,
        "user_id" | "provider" | "scope",
        [Fk<"calendar_connections_user_id_fkey", "user_id", "profiles">]
      >;
      calendar_connection_secrets: Table<
        CalendarConnectionSecretRow,
        "connection_id" | "user_id" | "refresh_token",
        [Fk<"calendar_connection_secrets_connection_id_fkey", "connection_id", "calendar_connections">]
      >;
      calendar_event_links: Table<
        CalendarEventLinkRow,
        "user_id" | "plan_id" | "connection_id" | "provider" | "session_id" | "external_event_id" | "fingerprint",
        [Fk<"calendar_event_links_plan_id_fkey", "plan_id", "plans">]
      >;
      session_checkins: Table<
        SessionCheckinRow,
        "user_id" | "plan_id" | "session_id" | "occurrence_date",
        [Fk<"session_checkins_plan_id_fkey", "plan_id", "plans">]
      >;
      purchases: Table<
        PurchaseRow,
        "product_key" | "provider_product_id",
        [Fk<"purchases_user_id_fkey", "user_id", "profiles">]
      >;
      entitlement_grants: Table<
        EntitlementGrantRow,
        "user_id" | "kind",
        [Fk<"entitlement_grants_user_id_fkey", "user_id", "profiles">]
      >;
      webhook_events: Table<WebhookEventRow, "id" | "provider" | "type">;
      manifested_entries: Table<
        ManifestedEntryRow,
        "user_id" | "title" | "desire" | "manifested_on",
        [Fk<"manifested_entries_plan_id_fkey", "plan_id", "plans">]
      >;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      owns_intake: { Args: { p_intake_id: string }; Returns: boolean };
      replace_intake_commitments: { Args: { p_intake_id: string; p_items: Json }; Returns: undefined };
      replace_intake_techniques: { Args: { p_intake_id: string; p_items: Json }; Returns: undefined };
      replace_manifestation_affirmations: { Args: { p_manifestation_id: string; p_items: Json }; Returns: undefined };
      submit_manifestation_intake: { Args: { p_intake_id: string; p_snapshot: Json }; Returns: string };
      request_plan_change: {
        Args: { p_plan_id: string; p_kind: Enums<"generation_kind">; p_params: Json };
        Returns: string;
      };
      retry_generation_request: { Args: { p_request_id: string }; Returns: undefined };
      save_plan_edit: {
        Args: {
          p_plan_id: string;
          p_document: Json;
          p_title: string;
          p_daily_minutes: number | null;
          p_summary: string;
          p_expected_version: number;
        };
        Returns: number;
      };
      restore_plan_version: { Args: { p_plan_id: string; p_version: number }; Returns: number };
      claim_generation_request: {
        Args: { p_request_id: string; p_stale_after?: string };
        Returns: GenerationRequestRow[];
      };
      complete_generation_request: {
        Args: {
          p_request_id: string;
          p_document: Json;
          p_title: string;
          p_daily_minutes: number | null;
          p_structure: Enums<"routine_style">;
          p_model: string;
          p_summary: string;
          p_base_version: number | null;
        };
        Returns: { plan_id: string; version_id: string; version: number }[];
      };
      fail_generation_request: {
        Args: { p_request_id: string; p_code: string; p_message: string; p_retryable: boolean };
        Returns: undefined;
      };
      set_plan_status: { Args: { p_plan_id: string; p_status: Enums<"plan_status"> }; Returns: undefined };
      duplicate_plan: { Args: { p_plan_id: string }; Returns: string };
      delete_plan: { Args: { p_plan_id: string }; Returns: undefined };
      reserve_generation_credit: { Args: { p_user_id: string }; Returns: string | null };
      consume_generation_credit: { Args: { p_grant_id: string; p_request_id: string }; Returns: undefined };
      release_generation_credit: { Args: { p_grant_id: string }; Returns: undefined };
      fulfil_purchase: {
        Args: { p_checkout_session_id: string; p_payment_id: string; p_amount: number | null; p_currency: string | null };
        Returns: { purchase_id: string; user_id: string | null; newly_paid: boolean }[];
      };
      refund_purchase: { Args: { p_payment_id: string }; Returns: undefined };
    };
    Enums: {
      manifestation_status: "active" | "paused" | "archived";
      plan_status: "draft" | "generating" | "ready" | "active" | "archived" | "paused" | "completed";
      routine_style: "light" | "balanced" | "structured" | "hourly" | "custom";
      intake_status: "in_progress" | "submitted" | "archived";
      intake_step: "desire" | "affirmations" | "methods" | "day" | "intensity" | "context" | "review";
      affirmation_mode: "own" | "generate" | "none";
      affirmation_source: "user" | "generated";
      technique:
        | "affirmations"
        | "askfirmations"
        | "visualization"
        | "sats"
        | "scripting"
        | "subliminals"
        | "inner_conversations"
        | "revision"
        | "meditation"
        | "other";
      technique_preference: "love" | "fine" | "avoid";
      commitment_kind: "work" | "school" | "commute" | "gym" | "class" | "childcare" | "other";
      time_budget: "5_10" | "15_30" | "30_60" | "60_plus" | "custom";
      generation_status: "queued" | "processing" | "completed" | "failed" | "cancelled";
      overlap_availability: "yes" | "some" | "no";
      generation_kind: "initial" | "adjust" | "regenerate_session";
      plan_version_source: "generated" | "adjusted" | "session_regenerated" | "user_edit" | "restored" | "duplicated";
      calendar_provider: "ics" | "google";
      calendar_connection_status: "connected" | "needs_reconnect";
      checkin_status: "done" | "skipped";
      purchase_status: "pending" | "paid" | "failed" | "cancelled" | "refunded";
      grant_kind: "routine_credit" | "free_credit" | "subscription";
      grant_status: "available" | "reserved" | "consumed" | "revoked";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];

export type Profile = Tables<"profiles">;
export type Plan = Tables<"plans">;
export type Manifestation = Tables<"manifestations">;

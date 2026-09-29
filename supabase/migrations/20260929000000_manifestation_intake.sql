-- =============================================================================
-- Assume — Phase 2: manifestation intake
--
-- The "create a plan" onboarding flow. One manifestation_intakes row is the
-- draft the user fills in step by step; relational children hold anything
-- that is a list (commitments, technique preferences, affirmations).
--
-- On submit, the intake is frozen into plan_generation_requests.input_snapshot
-- (versioned jsonb). Phase 3's generator consumes that snapshot and writes the
-- resulting plan to public.plans.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Routine style replaces the Phase 1 routine_structure enum
-- -----------------------------------------------------------------------------

create type public.routine_style as enum ('light', 'balanced', 'structured', 'hourly', 'custom');

alter table public.plans alter column structure drop default;
alter table public.plans
  alter column structure type public.routine_style
  using (case structure::text when 'flexible' then 'light' else structure::text end)::public.routine_style;
alter table public.plans alter column structure set default 'balanced';
drop type public.routine_structure;

-- "Deadline" implies a guarantee; the product talks about a relevant date.
alter table public.manifestations rename column deadline to relevant_date;
comment on column public.manifestations.relevant_date is
  'A date the user says is relevant to the desire. Used for pacing only — never framed as a guarantee.';

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

create type public.intake_status as enum ('in_progress', 'submitted', 'archived');
create type public.intake_step as enum ('desire', 'affirmations', 'methods', 'day', 'intensity', 'context', 'review');
create type public.affirmation_mode as enum ('own', 'generate', 'none');
create type public.affirmation_source as enum ('user', 'generated');
create type public.technique as enum (
  'affirmations', 'askfirmations', 'visualization', 'sats', 'scripting',
  'subliminals', 'inner_conversations', 'revision', 'meditation', 'other'
);
create type public.technique_preference as enum ('love', 'fine', 'avoid');
create type public.commitment_kind as enum ('work', 'school', 'commute', 'gym', 'class', 'childcare', 'other');
create type public.time_budget as enum ('5_10', '15_30', '30_60', '60_plus', 'custom');
create type public.generation_status as enum ('queued', 'processing', 'completed', 'failed', 'cancelled');

-- -----------------------------------------------------------------------------
-- manifestation_intakes — the onboarding draft
-- -----------------------------------------------------------------------------

create table public.manifestation_intakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Created lazily once the user has typed their desire.
  manifestation_id uuid references public.manifestations (id) on delete cascade,
  status public.intake_status not null default 'in_progress',
  current_step public.intake_step not null default 'desire',
  completed_steps public.intake_step[] not null default '{}',

  -- Step 2
  affirmation_mode public.affirmation_mode,

  -- Step 3
  methods_unsure boolean not null default false,
  other_technique_label text check (other_technique_label is null or char_length(other_technique_label) <= 80),

  -- Step 5
  time_budget public.time_budget,
  custom_minutes smallint check (custom_minutes is null or custom_minutes between 1 and 600),
  routine_style public.routine_style,
  routine_style_note text check (routine_style_note is null or char_length(routine_style_note) <= 1000),
  quiet_times text check (quiet_times is null or char_length(quiet_times) <= 1000),

  -- Step 6
  has_relevant_date boolean,
  additional_notes text check (additional_notes is null or char_length(additional_notes) <= 4000),

  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index manifestation_intakes_user_idx on public.manifestation_intakes (user_id, status, updated_at desc);
create index manifestation_intakes_manifestation_idx on public.manifestation_intakes (manifestation_id);

create trigger manifestation_intakes_set_updated_at
  before update on public.manifestation_intakes
  for each row execute function public.set_updated_at();

alter table public.manifestation_intakes enable row level security;

create policy "Intakes are viewable by their owner"
  on public.manifestation_intakes for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Intakes are insertable by their owner"
  on public.manifestation_intakes for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'in_progress');

create policy "Intakes are updatable by their owner"
  on public.manifestation_intakes for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      manifestation_id is null
      or exists (
        select 1 from public.manifestations m
        where m.id = manifestation_id and m.user_id = (select auth.uid())
      )
    )
  );

create policy "Intakes are deletable by their owner"
  on public.manifestation_intakes for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Ownership helper for child tables. SECURITY DEFINER so it can be used inside
-- other tables' policies without recursive RLS evaluation; it only ever
-- answers for the calling user.
create or replace function public.owns_intake(p_intake_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.manifestation_intakes i
    where i.id = p_intake_id and i.user_id = (select auth.uid())
  );
$$;

revoke all on function public.owns_intake(uuid) from public;
grant execute on function public.owns_intake(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- schedule_preferences — the user's typical day (1:1 with an intake)
-- -----------------------------------------------------------------------------

create table public.schedule_preferences (
  intake_id uuid primary key references public.manifestation_intakes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  wake_time time,
  sleep_time time,
  typical_day text check (typical_day is null or char_length(typical_day) <= 4000),
  weekends_different boolean,
  weekend_description text check (weekend_description is null or char_length(weekend_description) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger schedule_preferences_set_updated_at
  before update on public.schedule_preferences
  for each row execute function public.set_updated_at();

alter table public.schedule_preferences enable row level security;

create policy "Schedules are viewable by their owner"
  on public.schedule_preferences for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Schedules are insertable by their owner"
  on public.schedule_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id and public.owns_intake(intake_id));

create policy "Schedules are updatable by their owner"
  on public.schedule_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and public.owns_intake(intake_id));

create policy "Schedules are deletable by their owner"
  on public.schedule_preferences for delete to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- recurring_commitments — optional structured blocks (work, gym, school run…)
-- weekdays use ISO numbering: 1 = Monday … 7 = Sunday.
-- end_time < start_time is allowed (overnight shifts).
-- -----------------------------------------------------------------------------

create table public.recurring_commitments (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.manifestation_intakes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.commitment_kind not null,
  label text not null check (char_length(label) between 1 and 80),
  weekdays smallint[] not null default '{}' check (weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  start_time time,
  end_time time,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recurring_commitments_intake_idx on public.recurring_commitments (intake_id, position);

create trigger recurring_commitments_set_updated_at
  before update on public.recurring_commitments
  for each row execute function public.set_updated_at();

alter table public.recurring_commitments enable row level security;

create policy "Commitments are viewable by their owner"
  on public.recurring_commitments for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Commitments are insertable by their owner"
  on public.recurring_commitments for insert to authenticated
  with check ((select auth.uid()) = user_id and public.owns_intake(intake_id));

create policy "Commitments are updatable by their owner"
  on public.recurring_commitments for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and public.owns_intake(intake_id));

create policy "Commitments are deletable by their owner"
  on public.recurring_commitments for delete to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- technique_preferences — love / fine / avoid per method
-- -----------------------------------------------------------------------------

create table public.technique_preferences (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.manifestation_intakes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  technique public.technique not null,
  preference public.technique_preference not null,
  created_at timestamptz not null default now(),
  unique (intake_id, technique)
);

alter table public.technique_preferences enable row level security;

create policy "Technique preferences are viewable by their owner"
  on public.technique_preferences for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Technique preferences are insertable by their owner"
  on public.technique_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id and public.owns_intake(intake_id));

create policy "Technique preferences are updatable by their owner"
  on public.technique_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and public.owns_intake(intake_id));

create policy "Technique preferences are deletable by their owner"
  on public.technique_preferences for delete to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- affirmations — belong to the manifestation, so they outlive any one plan.
-- source = 'generated' rows are written by Phase 3.
-- -----------------------------------------------------------------------------

create table public.affirmations (
  id uuid primary key default gen_random_uuid(),
  manifestation_id uuid not null references public.manifestations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  position smallint not null default 0,
  source public.affirmation_source not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index affirmations_manifestation_idx on public.affirmations (manifestation_id, position);

create trigger affirmations_set_updated_at
  before update on public.affirmations
  for each row execute function public.set_updated_at();

alter table public.affirmations enable row level security;

create policy "Affirmations are viewable by their owner"
  on public.affirmations for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Affirmations are insertable by their owner"
  on public.affirmations for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.manifestations m
      where m.id = manifestation_id and m.user_id = (select auth.uid())
    )
  );

create policy "Affirmations are updatable by their owner"
  on public.affirmations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.manifestations m
      where m.id = manifestation_id and m.user_id = (select auth.uid())
    )
  );

create policy "Affirmations are deletable by their owner"
  on public.affirmations for delete to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- plan_generation_requests — the hand-off to Phase 3
--
-- Users can create (via submit_manifestation_intake) and read their requests,
-- but status/plan_id/error are written only by the server-side generator
-- using the service role, so there is no user update policy.
-- -----------------------------------------------------------------------------

create table public.plan_generation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  intake_id uuid not null references public.manifestation_intakes (id) on delete cascade,
  manifestation_id uuid not null references public.manifestations (id) on delete cascade,
  plan_id uuid references public.plans (id) on delete set null,
  status public.generation_status not null default 'queued',
  input_snapshot jsonb not null,
  snapshot_version smallint not null default 1,
  attempts smallint not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_generation_requests_snapshot_is_object check (jsonb_typeof(input_snapshot) = 'object')
);

create index plan_generation_requests_user_idx on public.plan_generation_requests (user_id, created_at desc);
create index plan_generation_requests_queue_idx on public.plan_generation_requests (status, created_at)
  where status in ('queued', 'processing');
-- At most one live request per intake.
create unique index plan_generation_requests_one_active_per_intake
  on public.plan_generation_requests (intake_id)
  where status in ('queued', 'processing');

create trigger plan_generation_requests_set_updated_at
  before update on public.plan_generation_requests
  for each row execute function public.set_updated_at();

alter table public.plan_generation_requests enable row level security;

create policy "Generation requests are viewable by their owner"
  on public.plan_generation_requests for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Generation requests are insertable by their owner"
  on public.plan_generation_requests for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'queued'
    and plan_id is null
    and public.owns_intake(intake_id)
  );

-- Plans can now point back at the intake they were built from.
alter table public.plans
  add column intake_id uuid references public.manifestation_intakes (id) on delete set null;
create index plans_intake_id_idx on public.plans (intake_id);

-- -----------------------------------------------------------------------------
-- Atomic list replacement (SECURITY INVOKER — RLS still applies)
-- -----------------------------------------------------------------------------

create or replace function public.replace_intake_commitments(p_intake_id uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.owns_intake(p_intake_id) then
    raise exception 'intake not found' using errcode = 'P0002';
  end if;

  delete from public.recurring_commitments where intake_id = p_intake_id;

  insert into public.recurring_commitments (intake_id, user_id, kind, label, weekdays, start_time, end_time, position)
  select
    p_intake_id,
    (select auth.uid()),
    (item ->> 'kind')::public.commitment_kind,
    item ->> 'label',
    coalesce(
      (select array_agg(d::smallint order by d::smallint) from jsonb_array_elements_text(item -> 'weekdays') d),
      '{}'
    ),
    nullif(item ->> 'start', '')::time,
    nullif(item ->> 'end', '')::time,
    (ord - 1)::smallint
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(item, ord);
end;
$$;

create or replace function public.replace_intake_techniques(p_intake_id uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.owns_intake(p_intake_id) then
    raise exception 'intake not found' using errcode = 'P0002';
  end if;

  delete from public.technique_preferences where intake_id = p_intake_id;

  insert into public.technique_preferences (intake_id, user_id, technique, preference)
  select
    p_intake_id,
    (select auth.uid()),
    (item ->> 'technique')::public.technique,
    (item ->> 'preference')::public.technique_preference
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as t(item);
end;
$$;

create or replace function public.replace_manifestation_affirmations(p_manifestation_id uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.manifestations m
    where m.id = p_manifestation_id and m.user_id = (select auth.uid())
  ) then
    raise exception 'manifestation not found' using errcode = 'P0002';
  end if;

  -- Only the user's own affirmations are replaced; generated ones are kept.
  delete from public.affirmations where manifestation_id = p_manifestation_id and source = 'user';

  insert into public.affirmations (manifestation_id, user_id, text, position, source)
  select p_manifestation_id, (select auth.uid()), txt, (row_number() over (order by ord) - 1)::smallint, 'user'
  from (
    select trim(item ->> 'text') as txt, ord
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(item, ord)
  ) s
  where length(txt) > 0;
end;
$$;

-- Freeze an intake and enqueue it for generation, atomically.
create or replace function public.submit_manifestation_intake(p_intake_id uuid, p_snapshot jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_intake public.manifestation_intakes;
  v_request_id uuid;
begin
  select * into v_intake
  from public.manifestation_intakes
  where id = p_intake_id and user_id = (select auth.uid())
  for update;

  if not found then
    raise exception 'intake not found' using errcode = 'P0002';
  end if;

  -- Idempotent: a second submit returns the live request.
  if v_intake.status = 'submitted' then
    select id into v_request_id
    from public.plan_generation_requests
    where intake_id = p_intake_id
    order by created_at desc
    limit 1;
    return v_request_id;
  end if;

  if v_intake.status <> 'in_progress' then
    raise exception 'intake is not editable' using errcode = 'P0001';
  end if;

  if v_intake.manifestation_id is null then
    raise exception 'intake has no manifestation' using errcode = 'P0001';
  end if;

  insert into public.plan_generation_requests (user_id, intake_id, manifestation_id, input_snapshot)
  values ((select auth.uid()), p_intake_id, v_intake.manifestation_id, p_snapshot)
  returning id into v_request_id;

  update public.manifestation_intakes
  set status = 'submitted', current_step = 'review', submitted_at = now()
  where id = p_intake_id;

  return v_request_id;
end;
$$;

revoke all on function public.replace_intake_commitments(uuid, jsonb) from public;
revoke all on function public.replace_intake_techniques(uuid, jsonb) from public;
revoke all on function public.replace_manifestation_affirmations(uuid, jsonb) from public;
revoke all on function public.submit_manifestation_intake(uuid, jsonb) from public;
grant execute on function public.replace_intake_commitments(uuid, jsonb) to authenticated;
grant execute on function public.replace_intake_techniques(uuid, jsonb) to authenticated;
grant execute on function public.replace_manifestation_affirmations(uuid, jsonb) to authenticated;
grant execute on function public.submit_manifestation_intake(uuid, jsonb) to authenticated;

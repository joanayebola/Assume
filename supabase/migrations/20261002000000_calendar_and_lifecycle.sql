-- =============================================================================
-- Assume — Phase 4: calendar, Today, plan lifecycle, manifested archive
--
-- • plans gain paused / completed states (+ timestamps). Paused plans stay
--   intact but disappear from Today.
-- • calendar_exports records the latest export per plan and provider, with a
--   fingerprint of what was sent, so edits are detected and re-exports never
--   silently duplicate events.
-- • calendar_connections (metadata, owner-readable) + calendar_connection_secrets
--   (encrypted OAuth tokens, service role only) for Google Calendar.
-- • calendar_event_links maps each routine session to its Google event id.
-- • session_checkins: Done / Skip / Move-today for a single occurrence.
--   Deliberately no streaks or counters.
-- • manifested_entries: the user's manifested archive.
-- =============================================================================

-- New enum values are only *used* inside function bodies below (resolved at
-- call time), so this file is safe to run in a single transaction.
alter type public.plan_status add value if not exists 'paused';
alter type public.plan_status add value if not exists 'completed';
alter type public.plan_version_source add value if not exists 'duplicated';

create type public.calendar_provider as enum ('ics', 'google');
create type public.calendar_connection_status as enum ('connected', 'needs_reconnect');
create type public.checkin_status as enum ('done', 'skipped');

alter table public.plans
  add column paused_at timestamptz,
  add column completed_at timestamptz,
  add column archived_at timestamptz;

-- -----------------------------------------------------------------------------
-- Profiles: calendar defaults + capture the browser timezone at sign-up
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column calendar_preferences jsonb,
  add constraint profiles_calendar_preferences_is_object
    check (calendar_preferences is null or jsonb_typeof(calendar_preferences) = 'object');

comment on column public.profiles.calendar_preferences is
  'Default calendar export privacy: title style, which details go in descriptions, reminder.';

-- Sign-up sends the browser's IANA timezone; only accept names Postgres knows.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text := nullif(trim(new.raw_user_meta_data ->> 'timezone'), '');
begin
  if v_tz is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then
    v_tz := 'UTC';
  end if;
  insert into public.profiles (id, email, display_name, timezone)
  values (
    new.id,
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    v_tz
  );
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- calendar_exports — latest export per plan + provider
-- -----------------------------------------------------------------------------

create table public.calendar_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_id uuid not null references public.plans (id) on delete cascade,
  provider public.calendar_provider not null,
  options jsonb not null check (jsonb_typeof(options) = 'object'),
  fingerprint text not null check (char_length(fingerprint) <= 64),
  plan_version integer not null,
  event_count smallint not null check (event_count between 0 and 60),
  export_count integer not null default 1,
  last_exported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, provider)
);

create index calendar_exports_user_idx on public.calendar_exports (user_id);

create trigger calendar_exports_set_updated_at
  before update on public.calendar_exports
  for each row execute function public.set_updated_at();

alter table public.calendar_exports enable row level security;

create policy "Calendar exports are viewable by their owner"
  on public.calendar_exports for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Calendar exports are insertable by their owner"
  on public.calendar_exports for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.plans p where p.id = plan_id and p.user_id = (select auth.uid()))
  );

create policy "Calendar exports are updatable by their owner"
  on public.calendar_exports for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Calendar exports are deletable by their owner"
  on public.calendar_exports for delete to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- Google Calendar connections
-- -----------------------------------------------------------------------------

create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider public.calendar_provider not null check (provider <> 'ics'),
  status public.calendar_connection_status not null default 'connected',
  -- The secondary calendar Assume created (calendar.app.created scope).
  calendar_id text,
  calendar_name text check (calendar_name is null or char_length(calendar_name) <= 100),
  scope text not null,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create trigger calendar_connections_set_updated_at
  before update on public.calendar_connections
  for each row execute function public.set_updated_at();

alter table public.calendar_connections enable row level security;

create policy "Calendar connections are viewable by their owner"
  on public.calendar_connections for select to authenticated
  using ((select auth.uid()) = user_id);
-- Writes happen server-side with the service role (OAuth callback, sync).

-- Encrypted tokens. RLS on with no policies: only the service role can read.
create table public.calendar_connection_secrets (
  connection_id uuid primary key references public.calendar_connections (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.calendar_connection_secrets enable row level security;
revoke all on public.calendar_connection_secrets from anon, authenticated;

create trigger calendar_connection_secrets_set_updated_at
  before update on public.calendar_connection_secrets
  for each row execute function public.set_updated_at();

-- Which external event each routine session became.
create table public.calendar_event_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_id uuid not null references public.plans (id) on delete cascade,
  connection_id uuid not null references public.calendar_connections (id) on delete cascade,
  provider public.calendar_provider not null,
  session_id text not null check (char_length(session_id) <= 40),
  external_event_id text not null check (char_length(external_event_id) <= 1024),
  fingerprint text not null check (char_length(fingerprint) <= 64),
  synced_at timestamptz not null default now(),
  unique (plan_id, provider, session_id)
);

create index calendar_event_links_plan_idx on public.calendar_event_links (plan_id, provider);

alter table public.calendar_event_links enable row level security;

create policy "Calendar event links are viewable by their owner"
  on public.calendar_event_links for select to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- session_checkins — one occurrence's Done / Skip / Move
-- -----------------------------------------------------------------------------

create table public.session_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_id uuid not null references public.plans (id) on delete cascade,
  session_id text not null check (char_length(session_id) <= 40),
  -- Local date (in the plan's timezone) the occurrence belongs to.
  occurrence_date date not null,
  status public.checkin_status,
  -- "Move today": when this one occurrence now happens (an instant, so it's
  -- unambiguous even when the viewer and the plan are in different zones).
  moved_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, session_id, occurrence_date),
  constraint session_checkins_has_state check (status is not null or moved_to is not null)
);

create index session_checkins_user_date_idx on public.session_checkins (user_id, occurrence_date);

create trigger session_checkins_set_updated_at
  before update on public.session_checkins
  for each row execute function public.set_updated_at();

alter table public.session_checkins enable row level security;

create policy "Check-ins are viewable by their owner"
  on public.session_checkins for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Check-ins are insertable by their owner"
  on public.session_checkins for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.plans p where p.id = plan_id and p.user_id = (select auth.uid()))
  );

create policy "Check-ins are updatable by their owner"
  on public.session_checkins for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Check-ins are deletable by their owner"
  on public.session_checkins for delete to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- manifested_entries — the manifested archive
-- -----------------------------------------------------------------------------

create table public.manifested_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_id uuid references public.plans (id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  desire text not null check (char_length(desire) <= 1000),
  note text check (note is null or char_length(note) <= 1000),
  manifested_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index manifested_entries_user_idx on public.manifested_entries (user_id, manifested_on desc);
create unique index manifested_entries_plan_idx on public.manifested_entries (plan_id) where plan_id is not null;

create trigger manifested_entries_set_updated_at
  before update on public.manifested_entries
  for each row execute function public.set_updated_at();

alter table public.manifested_entries enable row level security;

create policy "Manifested entries are viewable by their owner"
  on public.manifested_entries for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Manifested entries are insertable by their owner"
  on public.manifested_entries for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (plan_id is null or exists (select 1 from public.plans p where p.id = plan_id and p.user_id = (select auth.uid())))
  );

create policy "Manifested entries are updatable by their owner"
  on public.manifested_entries for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Manifested entries are deletable by their owner"
  on public.manifested_entries for delete to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- Lifecycle functions
-- -----------------------------------------------------------------------------

-- Change a plan's lifecycle state with valid transitions only.
create or replace function public.set_plan_status(p_plan_id uuid, p_status public.plan_status)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan public.plans;
begin
  select * into v_plan from public.plans where id = p_plan_id and user_id = (select auth.uid()) for update;
  if not found then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;
  if p_status::text not in ('active', 'paused', 'completed', 'archived') then
    raise exception 'invalid status' using errcode = 'P0001';
  end if;

  update public.plans
  set status = p_status,
      paused_at = case when p_status::text = 'paused' then now() when p_status::text = 'active' then null else paused_at end,
      completed_at = case when p_status::text = 'completed' then coalesce(completed_at, now()) when p_status::text = 'active' then null else completed_at end,
      archived_at = case when p_status::text = 'archived' then now() else null end
  where id = p_plan_id;
end;
$$;

-- Copy a plan (routine + the intake it came from) into a new, active plan.
create or replace function public.duplicate_plan(p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_new_id uuid;
  v_title text;
begin
  select * into v_plan from public.plans where id = p_plan_id and user_id = (select auth.uid());
  if not found or v_plan.routine is null then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;

  v_title := left(v_plan.title || ' (copy)', 160);
  insert into public.plans (
    user_id, manifestation_id, intake_id, title, status, structure, daily_minutes, timezone,
    intake, intake_version, routine, routine_version, generation_model, generated_at, current_version
  )
  values (
    v_plan.user_id, v_plan.manifestation_id, v_plan.intake_id, v_title, 'active', v_plan.structure,
    v_plan.daily_minutes, v_plan.timezone, v_plan.intake, v_plan.intake_version,
    jsonb_set(v_plan.routine, '{title}', to_jsonb(left(coalesce(v_plan.routine ->> 'title', v_plan.title) || ' (copy)', 100))),
    v_plan.routine_version, v_plan.generation_model, v_plan.generated_at, 1
  )
  returning id into v_new_id;

  insert into public.plan_versions (plan_id, user_id, version, document, source, summary, model)
  select v_new_id, v_plan.user_id, 1, p.routine, 'duplicated', 'Copied from “' || left(v_plan.title, 200) || '”', v_plan.generation_model
  from public.plans p where p.id = v_new_id;

  return v_new_id;
end;
$$;

-- Delete a plan for good. AI change requests tied to it are removed first
-- (their plan_id can't be nulled — see plan_generation_requests_plan_required).
create or replace function public.delete_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.plans where id = p_plan_id and user_id = (select auth.uid())) then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;
  delete from public.plan_generation_requests where plan_id = p_plan_id and kind <> 'initial';
  delete from public.plans where id = p_plan_id;
end;
$$;

revoke all on function public.set_plan_status(uuid, public.plan_status) from public;
revoke all on function public.duplicate_plan(uuid) from public;
revoke all on function public.delete_plan(uuid) from public;
grant execute on function public.set_plan_status(uuid, public.plan_status) to authenticated;
grant execute on function public.duplicate_plan(uuid) to authenticated;
grant execute on function public.delete_plan(uuid) to authenticated;

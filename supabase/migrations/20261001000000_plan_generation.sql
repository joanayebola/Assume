-- =============================================================================
-- Assume — Phase 3: routine generation, plan versions and editing
--
-- • plan_generation_requests gains a kind (initial / adjust / regenerate_session)
--   and params, so every AI change goes through the same persisted queue.
-- • plan_versions keeps every version of a plan; regeneration never silently
--   destroys the previous plan, and any version can be restored.
-- • Worker functions (claim / complete / fail) are callable only with the
--   service role. Users can create requests and read their status, but can
--   never write results — which is also where a Phase 5 payment entitlement
--   check can gate generation.
-- =============================================================================

create type public.generation_kind as enum ('initial', 'adjust', 'regenerate_session');
create type public.plan_version_source as enum ('generated', 'adjusted', 'session_regenerated', 'user_edit', 'restored');

alter table public.plan_generation_requests
  add column kind public.generation_kind not null default 'initial',
  add column params jsonb not null default '{}'::jsonb,
  add column base_version integer,
  add column result_version_id uuid,
  add column model text,
  add column error_code text,
  add constraint plan_generation_requests_params_is_object check (jsonb_typeof(params) = 'object'),
  add constraint plan_generation_requests_plan_required
    check (kind = 'initial' or plan_id is not null);

alter table public.plans
  add column current_version integer not null default 0;

-- -----------------------------------------------------------------------------
-- plan_versions
-- -----------------------------------------------------------------------------

create table public.plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  version integer not null check (version >= 1),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  source public.plan_version_source not null,
  summary text check (summary is null or char_length(summary) <= 300),
  generation_request_id uuid references public.plan_generation_requests (id) on delete set null,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, version)
);

create index plan_versions_plan_idx on public.plan_versions (plan_id, version desc);

create trigger plan_versions_set_updated_at
  before update on public.plan_versions
  for each row execute function public.set_updated_at();

alter table public.plan_generation_requests
  add constraint plan_generation_requests_result_version_fkey
  foreign key (result_version_id) references public.plan_versions (id) on delete set null;

alter table public.plan_versions enable row level security;

create policy "Plan versions are viewable by their owner"
  on public.plan_versions for select to authenticated
  using ((select auth.uid()) = user_id);
-- Writes go through save_plan_edit / restore_plan_version / the worker.

-- -----------------------------------------------------------------------------
-- Requests: allow adjust / regenerate requests that reference the user's plan
-- -----------------------------------------------------------------------------

drop policy "Generation requests are insertable by their owner" on public.plan_generation_requests;

create policy "Generation requests are insertable by their owner"
  on public.plan_generation_requests for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'queued'
    and result_version_id is null
    and public.owns_intake(intake_id)
    and (
      plan_id is null
      or exists (select 1 from public.plans p where p.id = plan_id and p.user_id = (select auth.uid()))
    )
  );

-- -----------------------------------------------------------------------------
-- User-callable functions (SECURITY INVOKER — RLS applies)
-- -----------------------------------------------------------------------------

-- Enqueue an adjustment or single-session regeneration for a plan.
-- Idempotent: while a request for this plan's intake is live, returns it.
create or replace function public.request_plan_change(p_plan_id uuid, p_kind public.generation_kind, p_params jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_request_id uuid;
begin
  if p_kind = 'initial' then
    raise exception 'use submit_manifestation_intake for initial plans' using errcode = 'P0001';
  end if;

  select * into v_plan from public.plans where id = p_plan_id and user_id = (select auth.uid());
  if not found or v_plan.intake_id is null or v_plan.manifestation_id is null then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;

  select id into v_request_id
  from public.plan_generation_requests
  where intake_id = v_plan.intake_id and status in ('queued', 'processing');
  if found then
    return v_request_id;
  end if;

  insert into public.plan_generation_requests (
    user_id, intake_id, manifestation_id, plan_id, kind, params, base_version, input_snapshot, snapshot_version
  )
  values (
    (select auth.uid()), v_plan.intake_id, v_plan.manifestation_id, v_plan.id, p_kind,
    coalesce(p_params, '{}'::jsonb), v_plan.current_version, v_plan.intake, v_plan.intake_version
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

-- Let a user retry their own failed request (bounded).
create or replace function public.retry_generation_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.plan_generation_requests
  set status = 'queued', error_code = null, error_message = null, started_at = null, completed_at = null
  where id = p_request_id
    and user_id = (select auth.uid())
    and status = 'failed'
    and attempts < 6;
  if not found then
    raise exception 'request cannot be retried' using errcode = 'P0001';
  end if;
end;
$$;

-- Save a user's edit. Consecutive edits within 10 minutes are coalesced into
-- one version so history stays readable; AI versions are never overwritten.
create or replace function public.save_plan_edit(
  p_plan_id uuid, p_document jsonb, p_title text, p_daily_minutes smallint, p_summary text, p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_latest public.plan_versions;
  v_version integer;
begin
  select * into v_plan from public.plans where id = p_plan_id and user_id = (select auth.uid()) for update;
  if not found then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;
  if v_plan.current_version <> p_expected_version then
    raise exception 'plan changed' using errcode = 'P0409';
  end if;
  if jsonb_typeof(p_document) <> 'object' then
    raise exception 'invalid document' using errcode = 'P0001';
  end if;

  select * into v_latest from public.plan_versions
  where plan_id = p_plan_id and version = v_plan.current_version;

  if found and v_latest.source = 'user_edit' and v_latest.created_at > now() - interval '10 minutes' then
    update public.plan_versions set document = p_document, summary = p_summary where id = v_latest.id;
    v_version := v_latest.version;
  else
    v_version := v_plan.current_version + 1;
    insert into public.plan_versions (plan_id, user_id, version, document, source, summary)
    values (p_plan_id, v_plan.user_id, v_version, p_document, 'user_edit', p_summary);
  end if;

  update public.plans
  set routine = p_document, title = left(p_title, 160), daily_minutes = p_daily_minutes, current_version = v_version
  where id = p_plan_id;

  return v_version;
end;
$$;

create or replace function public.restore_plan_version(p_plan_id uuid, p_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_source public.plan_versions;
  v_version integer;
begin
  select * into v_plan from public.plans where id = p_plan_id and user_id = (select auth.uid()) for update;
  if not found then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;
  select * into v_source from public.plan_versions where plan_id = p_plan_id and version = p_version;
  if not found then
    raise exception 'version not found' using errcode = 'P0002';
  end if;

  v_version := v_plan.current_version + 1;
  insert into public.plan_versions (plan_id, user_id, version, document, source, summary, model)
  values (p_plan_id, v_plan.user_id, v_version, v_source.document, 'restored', 'Restored version ' || p_version, v_source.model);

  update public.plans
  set routine = v_source.document,
      title = left(coalesce(v_source.document ->> 'title', v_plan.title), 160),
      current_version = v_version
  where id = p_plan_id;
  return v_version;
end;
$$;

revoke all on function public.request_plan_change(uuid, public.generation_kind, jsonb) from public;
revoke all on function public.retry_generation_request(uuid) from public;
revoke all on function public.save_plan_edit(uuid, jsonb, text, smallint, text, integer) from public;
revoke all on function public.restore_plan_version(uuid, integer) from public;
grant execute on function public.request_plan_change(uuid, public.generation_kind, jsonb) to authenticated;
grant execute on function public.retry_generation_request(uuid) to authenticated;
grant execute on function public.save_plan_edit(uuid, jsonb, text, smallint, text, integer) to authenticated;
grant execute on function public.restore_plan_version(uuid, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Worker functions (service role only)
-- -----------------------------------------------------------------------------

-- Atomically claim a queued request, or re-claim one whose worker died.
create or replace function public.claim_generation_request(p_request_id uuid, p_stale_after interval default interval '4 minutes')
returns setof public.plan_generation_requests
language sql
security definer
set search_path = ''
as $$
  update public.plan_generation_requests
  set status = 'processing', started_at = now(), attempts = attempts + 1, error_code = null, error_message = null
  where id = p_request_id
    and attempts < 6
    and (status = 'queued' or (status = 'processing' and started_at < now() - p_stale_after))
  returning *;
$$;

-- Persist a result and complete the request in one transaction.
--  initial            → create the plan + version 1
--  adjust / session   → new version on the existing plan (fails with P0409
--                       if the plan changed since the worker read it)
create or replace function public.complete_generation_request(
  p_request_id uuid,
  p_document jsonb,
  p_title text,
  p_daily_minutes smallint,
  p_structure public.routine_style,
  p_model text,
  p_summary text,
  p_base_version integer
)
returns table (plan_id uuid, version_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.plan_generation_requests;
  v_plan public.plans;
  v_plan_id uuid;
  v_version integer;
  v_version_id uuid;
  v_source public.plan_version_source;
begin
  select * into v_req from public.plan_generation_requests where id = p_request_id for update;
  if not found then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if v_req.status <> 'processing' then
    raise exception 'request is not processing' using errcode = 'P0001';
  end if;

  if v_req.kind = 'initial' then
    insert into public.plans (
      user_id, manifestation_id, intake_id, title, status, structure, daily_minutes, timezone,
      intake, intake_version, routine, routine_version, generation_model, generated_at, current_version
    )
    select v_req.user_id, v_req.manifestation_id, v_req.intake_id, left(p_title, 160), 'active', p_structure,
           p_daily_minutes, coalesce(v_req.input_snapshot ->> 'timezone', 'UTC'), v_req.input_snapshot,
           v_req.snapshot_version, p_document, 1, p_model, now(), 1
    returning id into v_plan_id;
    v_version := 1;
    v_source := 'generated';
  else
    select * into v_plan from public.plans where id = v_req.plan_id for update;
    if not found then
      raise exception 'plan not found' using errcode = 'P0002';
    end if;
    if v_plan.current_version <> p_base_version then
      raise exception 'plan changed' using errcode = 'P0409';
    end if;
    v_plan_id := v_plan.id;
    v_version := v_plan.current_version + 1;
    v_source := case v_req.kind when 'adjust' then 'adjusted'::public.plan_version_source else 'session_regenerated'::public.plan_version_source end;
    update public.plans
    set routine = p_document, title = left(p_title, 160), daily_minutes = p_daily_minutes,
        generation_model = p_model, generated_at = now(), current_version = v_version
    where id = v_plan_id;
  end if;

  insert into public.plan_versions (plan_id, user_id, version, document, source, summary, generation_request_id, model)
  values (v_plan_id, v_req.user_id, v_version, p_document, v_source, p_summary, p_request_id, p_model)
  returning id into v_version_id;

  update public.plan_generation_requests
  set status = 'completed', completed_at = now(), plan_id = v_plan_id, result_version_id = v_version_id,
      model = p_model, error_code = null, error_message = null
  where id = p_request_id;

  return query select v_plan_id, v_version_id, v_version;
end;
$$;

create or replace function public.fail_generation_request(p_request_id uuid, p_code text, p_message text, p_retryable boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.plan_generation_requests
  set status = 'failed',
      error_code = left(p_code, 40),
      error_message = left(p_message, 500),
      completed_at = now(),
      -- Non-retryable failures use up the attempts so they can't be re-claimed.
      attempts = case when p_retryable then attempts else 6 end
  where id = p_request_id and status = 'processing';
$$;

revoke all on function public.claim_generation_request(uuid, interval) from public, authenticated, anon;
revoke all on function public.complete_generation_request(uuid, jsonb, text, smallint, public.routine_style, text, text, integer) from public, authenticated, anon;
revoke all on function public.fail_generation_request(uuid, text, text, boolean) from public, authenticated, anon;
grant execute on function public.claim_generation_request(uuid, interval) to service_role;
grant execute on function public.complete_generation_request(uuid, jsonb, text, smallint, public.routine_style, text, text, integer) to service_role;
grant execute on function public.fail_generation_request(uuid, text, text, boolean) to service_role;

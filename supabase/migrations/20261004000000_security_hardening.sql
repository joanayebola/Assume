-- =============================================================================
-- Assume — Phase 5: security hardening
--
-- Paid generation means users must not be able to create plans or AI
-- requests by writing to tables directly through the API:
--
-- • plans: no direct insert/update/delete. Plans are created by the worker
--   (complete_generation_request) or duplicate_plan, and changed only through
--   save_plan_edit / restore_plan_version / set_plan_status / delete_plan.
--   Otherwise someone could insert their own plan row and "adjust" it into a
--   free generated routine.
-- • plan_generation_requests: direct inserts are limited to what
--   submit_manifestation_intake does (an initial request, empty params). The
--   worker refuses initial requests without a paid credit before calling
--   Gemini, so a hand-made one costs nothing. Adjustments go only through
--   request_plan_change, which now runs as definer and caps params size.
-- =============================================================================

drop policy if exists "Plans are insertable by their owner" on public.plans;
drop policy if exists "Plans are updatable by their owner" on public.plans;
drop policy if exists "Plans are deletable by their owner" on public.plans;

drop policy if exists "Generation requests are insertable by their owner" on public.plan_generation_requests;

create policy "Generation requests are insertable by their owner"
  on public.plan_generation_requests for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'queued'
    and kind = 'initial'
    and plan_id is null
    and params = '{}'::jsonb
    and result_version_id is null
    and attempts = 0
    and public.owns_intake(intake_id)
  );

-- Status changes no longer rely on an update policy.
create or replace function public.set_plan_status(p_plan_id uuid, p_status public.plan_status)
returns void
language plpgsql
security definer
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

-- Adjust / regenerate requests: definer, ownership-checked, bounded params.
create or replace function public.request_plan_change(p_plan_id uuid, p_kind public.generation_kind, p_params jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_request_id uuid;
begin
  if p_kind = 'initial' then
    raise exception 'use submit_manifestation_intake for initial plans' using errcode = 'P0001';
  end if;
  if p_params is null or jsonb_typeof(p_params) <> 'object' or octet_length(p_params::text) > 4000 then
    raise exception 'invalid params' using errcode = 'P0001';
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
    v_plan.user_id, v_plan.intake_id, v_plan.manifestation_id, v_plan.id, p_kind,
    p_params, v_plan.current_version, v_plan.intake, v_plan.intake_version
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.set_plan_status(uuid, public.plan_status) from public;
revoke all on function public.request_plan_change(uuid, public.generation_kind, jsonb) from public;
grant execute on function public.set_plan_status(uuid, public.plan_status) to authenticated;
grant execute on function public.request_plan_change(uuid, public.generation_kind, jsonb) to authenticated;

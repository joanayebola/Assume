-- =============================================================================
-- Assume — schedule activities are context, not blocked time
--
-- Each recurring commitment records whether manifestation can overlap with it
-- ("yes" / "some" / "no") and, for "some", which techniques the user is
-- comfortable doing during it. A commute or gym session can be an ideal
-- window for affirmations or subliminals; a class or childcare may not be.
-- =============================================================================

create type public.overlap_availability as enum ('yes', 'some', 'no');

alter table public.recurring_commitments
  add column manifestation_overlap public.overlap_availability,
  add column overlap_techniques public.technique[] not null default '{}',
  add column overlap_other_label text
    check (overlap_other_label is null or char_length(overlap_other_label) <= 80),
  add constraint recurring_commitments_overlap_techniques_only_for_some
    check (manifestation_overlap = 'some' or cardinality(overlap_techniques) = 0);

comment on column public.recurring_commitments.manifestation_overlap is
  'Could the user comfortably manifest during this activity? NULL while the intake is a draft.';
comment on column public.recurring_commitments.overlap_techniques is
  'When manifestation_overlap = ''some'': the techniques the user is comfortable doing during this activity.';

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

  insert into public.recurring_commitments (
    intake_id, user_id, kind, label, weekdays, start_time, end_time, position,
    manifestation_overlap, overlap_techniques, overlap_other_label
  )
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
    (ord - 1)::smallint,
    nullif(item ->> 'overlap', '')::public.overlap_availability,
    -- Techniques only count when overlap is "some".
    case when item ->> 'overlap' = 'some' then
      coalesce(
        (select array_agg(distinct t::public.technique) from jsonb_array_elements_text(item -> 'overlapTechniques') t),
        '{}'
      )
    else '{}' end,
    case when item ->> 'overlap' = 'some' then nullif(trim(item ->> 'overlapOtherLabel'), '') end
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(item, ord);
end;
$$;

-- Record the snapshot's own version on the request so generators can branch
-- on the column without parsing the payload.
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

  insert into public.plan_generation_requests (user_id, intake_id, manifestation_id, input_snapshot, snapshot_version)
  values (
    (select auth.uid()),
    p_intake_id,
    v_intake.manifestation_id,
    p_snapshot,
    coalesce((p_snapshot ->> 'version')::smallint, 1)
  )
  returning id into v_request_id;

  update public.manifestation_intakes
  set status = 'submitted', current_step = 'review', submitted_at = now()
  where id = p_intake_id;

  return v_request_id;
end;
$$;

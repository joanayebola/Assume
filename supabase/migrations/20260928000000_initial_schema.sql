-- =============================================================================
-- Assume — initial schema
--
-- Phase 1 fully uses: profiles (+ auto-creation on sign-up).
-- Phase 2+ will use:   manifestations, plans (tables, RLS and indexes are ready).
--
-- Conventions
--   • Every user-owned table has user_id → profiles(id) ON DELETE CASCADE,
--     so deleting an auth user removes all of their data.
--   • RLS is enabled on every table; policies are owner-only.
--   • updated_at is maintained by a shared trigger.
--   • Free-form questionnaire answers and generated routines are stored as
--     versioned jsonb so the shape can evolve without destructive migrations.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

create type public.manifestation_status as enum ('active', 'paused', 'archived');

create type public.plan_status as enum ('draft', 'generating', 'ready', 'active', 'archived');

create type public.routine_structure as enum ('flexible', 'balanced', 'structured');

-- -----------------------------------------------------------------------------
-- profiles — one row per auth user
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  timezone text not null default 'UTC',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Public profile data for each authenticated user.';
comment on column public.profiles.timezone is 'IANA timezone name, used to place routine sessions on the calendar.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "Profiles are viewable by their owner"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Profiles are updatable by their owner"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Rows are created by the trigger below; no client insert/delete policies.

-- Create a profile automatically whenever a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in sync if the user changes their email address.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- -----------------------------------------------------------------------------
-- manifestations — what the user is manifesting (Phase 2)
-- -----------------------------------------------------------------------------

create table public.manifestations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  desire text not null check (char_length(desire) <= 4000),
  circumstances text check (circumstances is null or char_length(circumstances) <= 4000),
  desired_end text check (desired_end is null or char_length(desired_end) <= 4000),
  deadline date,
  status public.manifestation_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.manifestations.desired_end is 'What the desire looks like once it has happened, in the user''s words.';

create index manifestations_user_id_idx on public.manifestations (user_id, created_at desc);

create trigger manifestations_set_updated_at
  before update on public.manifestations
  for each row execute function public.set_updated_at();

alter table public.manifestations enable row level security;

create policy "Manifestations are viewable by their owner"
  on public.manifestations for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Manifestations are insertable by their owner"
  on public.manifestations for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Manifestations are updatable by their owner"
  on public.manifestations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Manifestations are deletable by their owner"
  on public.manifestations for delete to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- plans — a personalised routine built for one manifestation (Phase 2+)
--
--   intake   — the questionnaire snapshot used to build the plan
--              (affirmations, liked/disliked methods, wake/sleep, schedule,
--               commute, commitments, free periods, time budget, notes…)
--   routine  — the generated, user-editable routine (sessions, times, methods)
--   *_version columns let the app migrate jsonb shapes forward safely.
-- -----------------------------------------------------------------------------

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  manifestation_id uuid references public.manifestations (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  status public.plan_status not null default 'draft',
  structure public.routine_structure not null default 'balanced',
  daily_minutes smallint check (daily_minutes is null or daily_minutes between 1 and 600),
  timezone text not null default 'UTC',
  intake jsonb not null default '{}'::jsonb,
  intake_version smallint not null default 1,
  routine jsonb,
  routine_version smallint not null default 1,
  generation_model text,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_intake_is_object check (jsonb_typeof(intake) = 'object'),
  constraint plans_routine_is_object check (routine is null or jsonb_typeof(routine) = 'object')
);

create index plans_user_id_idx on public.plans (user_id, updated_at desc);
create index plans_manifestation_id_idx on public.plans (manifestation_id);

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

alter table public.plans enable row level security;

create policy "Plans are viewable by their owner"
  on public.plans for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Plans are insertable by their owner"
  on public.plans for insert to authenticated
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

create policy "Plans are updatable by their owner"
  on public.plans for update to authenticated
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

create policy "Plans are deletable by their owner"
  on public.plans for delete to authenticated
  using ((select auth.uid()) = user_id);

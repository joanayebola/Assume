-- =============================================================================
-- Assume — Phase 5: billing, entitlements, account
--
-- • purchases: one row per checkout (Dodo Payments). Created *pending* by the
--   server before redirecting to checkout; only the server (webhook or a
--   server-side payment lookup) can mark it paid. Kept, unlinked, if the
--   account is deleted (payment records — see docs/legal review).
-- • entitlement_grants: what a user may generate. One row per routine credit
--   ('routine_credit' from a purchase, 'free_credit' from a configured free
--   allowance) and one per subscription ('subscription', future tier).
--   Credits move available → reserved → consumed; users can only read them.
-- • webhook_events: processed webhook ids, for idempotency.
-- • profiles.intake_defaults: preferred wake/sleep, techniques and intensity
--   used to prefill new intakes.
-- =============================================================================

create type public.purchase_status as enum ('pending', 'paid', 'failed', 'cancelled', 'refunded');
create type public.grant_kind as enum ('routine_credit', 'free_credit', 'subscription');
create type public.grant_status as enum ('available', 'reserved', 'consumed', 'revoked');

-- -----------------------------------------------------------------------------
-- purchases
-- -----------------------------------------------------------------------------

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  provider text not null default 'dodo' check (provider in ('dodo')),
  product_key text not null check (char_length(product_key) <= 40),
  provider_product_id text not null check (char_length(provider_product_id) <= 100),
  checkout_session_id text unique check (checkout_session_id is null or char_length(checkout_session_id) <= 200),
  provider_payment_id text unique check (provider_payment_id is null or char_length(provider_payment_id) <= 200),
  -- The intake being paid for, so the success page can continue the journey.
  intake_id uuid references public.manifestation_intakes (id) on delete set null,
  status public.purchase_status not null default 'pending',
  amount integer check (amount is null or amount >= 0),
  currency text check (currency is null or char_length(currency) = 3),
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index purchases_user_idx on public.purchases (user_id, created_at desc);

create trigger purchases_set_updated_at
  before update on public.purchases
  for each row execute function public.set_updated_at();

alter table public.purchases enable row level security;

create policy "Purchases are viewable by their owner"
  on public.purchases for select to authenticated
  using ((select auth.uid()) = user_id);
-- No user writes: rows are created and updated by the server (service role).

-- -----------------------------------------------------------------------------
-- entitlement_grants
-- -----------------------------------------------------------------------------

create table public.entitlement_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.grant_kind not null,
  status public.grant_status not null default 'available',
  purchase_id uuid unique references public.purchases (id) on delete set null,
  -- The generation request a credit paid for.
  request_id uuid unique references public.plan_generation_requests (id) on delete set null,
  reserved_at timestamptz,
  consumed_at timestamptz,
  -- Subscriptions: access until this instant (null for credits).
  valid_until timestamptz,
  provider_subscription_id text unique check (provider_subscription_id is null or char_length(provider_subscription_id) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index entitlement_grants_user_idx on public.entitlement_grants (user_id, kind, status);
-- At most one free credit per person, ever.
create unique index entitlement_grants_one_free on public.entitlement_grants (user_id) where kind = 'free_credit';

create trigger entitlement_grants_set_updated_at
  before update on public.entitlement_grants
  for each row execute function public.set_updated_at();

alter table public.entitlement_grants enable row level security;

create policy "Entitlements are viewable by their owner"
  on public.entitlement_grants for select to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- webhook_events — idempotency
-- -----------------------------------------------------------------------------

create table public.webhook_events (
  id text primary key check (char_length(id) <= 200),
  provider text not null,
  type text not null check (char_length(type) <= 100),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.webhook_events enable row level security;
revoke all on public.webhook_events from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Profiles: defaults for new intakes
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column intake_defaults jsonb,
  add constraint profiles_intake_defaults_is_object
    check (intake_defaults is null or jsonb_typeof(intake_defaults) = 'object');

-- -----------------------------------------------------------------------------
-- Credit functions (service role only)
-- -----------------------------------------------------------------------------

-- Reserve one available credit for a user (oldest first). Concurrency-safe:
-- two submissions can never reserve the same credit.
create or replace function public.reserve_generation_credit(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.entitlement_grants
  where user_id = p_user_id and kind in ('routine_credit', 'free_credit') and status = 'available'
  order by kind desc, created_at
  limit 1
  for update skip locked;
  if not found then
    return null;
  end if;
  update public.entitlement_grants set status = 'reserved', reserved_at = now() where id = v_id;
  return v_id;
end;
$$;

-- Tie a reserved credit to the request it pays for.
create or replace function public.consume_generation_credit(p_grant_id uuid, p_request_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.entitlement_grants
  set status = 'consumed', consumed_at = now(), request_id = p_request_id
  where id = p_grant_id and status in ('reserved', 'consumed');
$$;

-- Give a credit back (submission failed, or the routine could never be built).
create or replace function public.release_generation_credit(p_grant_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.entitlement_grants
  set status = 'available', reserved_at = null, consumed_at = null, request_id = null
  where id = p_grant_id and status in ('reserved', 'consumed');
$$;

-- Mark a checkout paid and grant its credit — exactly once, however many
-- times it's called (webhook retries, the success page, both at once).
create or replace function public.fulfil_purchase(
  p_checkout_session_id text,
  p_payment_id text,
  p_amount integer,
  p_currency text
)
returns table (purchase_id uuid, user_id uuid, newly_paid boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.purchases;
  v_new boolean := false;
begin
  select * into v_purchase from public.purchases where checkout_session_id = p_checkout_session_id for update;
  if not found then
    raise exception 'purchase not found' using errcode = 'P0002';
  end if;

  if v_purchase.status in ('pending', 'failed', 'cancelled') then
    update public.purchases
    set status = 'paid', provider_payment_id = coalesce(provider_payment_id, p_payment_id),
        amount = coalesce(p_amount, amount), currency = coalesce(upper(p_currency), currency), paid_at = now()
    where id = v_purchase.id;
    v_new := true;
  end if;

  if v_purchase.user_id is not null and v_purchase.status <> 'refunded' then
    insert into public.entitlement_grants (user_id, kind, purchase_id)
    values (v_purchase.user_id, 'routine_credit', v_purchase.id)
    on conflict (purchase_id) do nothing;
  end if;

  return query select v_purchase.id, v_purchase.user_id, v_new;
end;
$$;

-- Refund: mark the purchase and revoke its credit if it hasn't been used.
-- A routine already built stays — we don't take things away.
create or replace function public.refund_purchase(p_payment_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase_id uuid;
begin
  update public.purchases set status = 'refunded', refunded_at = now()
  where provider_payment_id = p_payment_id
  returning id into v_purchase_id;
  if v_purchase_id is null then
    return;
  end if;
  update public.entitlement_grants set status = 'revoked'
  where purchase_id = v_purchase_id and status in ('available', 'reserved');
end;
$$;

revoke all on function public.reserve_generation_credit(uuid) from public, anon, authenticated;
revoke all on function public.consume_generation_credit(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_generation_credit(uuid) from public, anon, authenticated;
revoke all on function public.fulfil_purchase(text, text, integer, text) from public, anon, authenticated;
revoke all on function public.refund_purchase(text) from public, anon, authenticated;
grant execute on function public.reserve_generation_credit(uuid) to service_role;
grant execute on function public.consume_generation_credit(uuid, uuid) to service_role;
grant execute on function public.release_generation_credit(uuid) to service_role;
grant execute on function public.fulfil_purchase(text, text, integer, text) to service_role;
grant execute on function public.refund_purchase(text) to service_role;

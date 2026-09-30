-- =============================================================================
-- Assume — table privileges for the Supabase API roles
--
-- Earlier migrations created tables and RLS policies but never GRANTed table
-- privileges, relying on Supabase's legacy default privileges (which used to
-- grant every new public table to anon/authenticated/service_role). Projects
-- created with "automatically expose new tables" turned off don't do that, so
-- every query failed with 42501 "permission denied" — for signed-in users and
-- for the service role alike, which broke everything after login.
--
-- Grants below match the RLS policies exactly (least privilege). RLS still
-- decides *which rows*; these decide *which operations* can be attempted.
--   anon           → no table access (the app never queries as anon)
--   authenticated  → only the operations each table has policies for
--   service_role   → full access (server-side worker / webhooks only)
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

-- Owner-only CRUD tables -------------------------------------------------------
grant select, insert, update, delete on table
  public.manifestations,
  public.plans,
  public.manifestation_intakes,
  public.schedule_preferences,
  public.recurring_commitments,
  public.technique_preferences,
  public.affirmations,
  public.calendar_exports,
  public.session_checkins,
  public.manifested_entries
to authenticated;

-- Profiles: rows are created by the sign-up trigger; users read and update theirs.
grant select, update on table public.profiles to authenticated;

-- Generation requests: users create (via submit / request functions) and read;
-- status is written only by the worker.
grant select, insert on table public.plan_generation_requests to authenticated;

-- Read-only for users; written by SECURITY DEFINER functions or the server.
grant select on table
  public.plan_versions,
  public.calendar_connections,
  public.calendar_event_links,
  public.purchases,
  public.entitlement_grants
to authenticated;

-- Never reachable by users: OAuth tokens and raw webhook payloads.
revoke all on table public.calendar_connection_secrets, public.webhook_events from anon, authenticated;

-- Nothing is readable anonymously.
revoke all on all tables in schema public from anon;

-- The service role (server only) needs everything.
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Future tables: the service role gets access automatically. Grants for
-- `authenticated` must be written explicitly in each new migration, next to
-- that table's RLS policies.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

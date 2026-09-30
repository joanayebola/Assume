import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Applies every migration to a real Postgres (PGlite) that — like current
 * Supabase projects — does NOT auto-grant new tables to the API roles, then
 * checks each role can do exactly what the app needs and nothing more.
 * Guards against the "permission denied for table …" class of bug.
 */

const dir = path.resolve(__dirname, "../supabase/migrations");
const USER = "11111111-1111-1111-1111-111111111111";
let db: PGlite;

async function as(role: "anon" | "authenticated" | "service_role", sql: string) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${USER}', false); set role ${role};`);
  try {
    await db.query(sql);
    return true;
  } catch {
    return false;
  } finally {
    await db.exec("reset role;");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    revoke all on schema public from public;
  `);
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(path.join(dir, f), "utf8"));
  await db.exec(`insert into auth.users (id, email) values ('${USER}', 'a@x.test')`);
}, 60_000);

describe("migrations: API role privileges", () => {
  it("lets signed-in users use their own data", async () => {
    expect(await as("authenticated", "select id from public.profiles")).toBe(true);
    expect(await as("authenticated", "update public.profiles set display_name = 'Ada' where id = auth.uid()")).toBe(true);
    expect(await as("authenticated", `insert into public.manifestation_intakes (user_id) values ('${USER}')`)).toBe(true);
    expect(await as("authenticated", "select id from public.plans")).toBe(true);
    expect(await as("authenticated", "select id from public.plan_versions")).toBe(true);
    expect(await as("authenticated", "select id from public.plan_generation_requests")).toBe(true);
  });

  it("keeps server-only writes and secrets away from users", async () => {
    expect(await as("authenticated", "update public.plan_generation_requests set status = 'completed'")).toBe(false);
    expect(await as("authenticated", "select * from public.calendar_connection_secrets")).toBe(false);
    expect(await as("authenticated", "select * from public.webhook_events")).toBe(false);
    expect(await as("anon", "select * from public.profiles")).toBe(false);
  });

  it("gives the server (service role) full access", async () => {
    expect(await as("service_role", "select id from public.profiles")).toBe(true);
    expect(await as("service_role", "select * from public.calendar_connection_secrets")).toBe(true);
  });

  it("grants every table explicitly (no table left without API privileges)", async () => {
    const { rows } = await db.query<{ table_name: string }>(`
      select c.relname as table_name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and not has_table_privilege('service_role', c.oid, 'select')
    `);
    expect(rows.map((r) => r.table_name)).toEqual([]);
  });
});

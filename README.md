# Assume

**Manifestation that fits your actual life.**

Assume is a manifestation routine planner. People tell it what they want, how they like to manifest and what their days actually look like, and get a personalised routine built around their real schedule — then run it from **Today**, add it to their calendar, and keep an archive of what's arrived.

---

## Stack

| Concern    | Choice |
| ---------- | ------ |
| Framework  | Next.js 16 (App Router, Server Components, Server Actions, `after()`) |
| Language   | TypeScript (strict) |
| Styling    | Tailwind CSS v4, design tokens in `src/app/globals.css` |
| Auth & DB  | Supabase (`@supabase/ssr`, Postgres, Row Level Security) |
| AI         | Google Gemini via `@google/genai`, strict JSON schema + Zod + mechanical checks |
| Payments   | Dodo Payments (checkout sessions, Standard Webhooks) |
| Calendar   | RFC 5545 `.ics` export; Google Calendar API (`calendar.app.created` scope) |
| Analytics  | Server-side, provider-configurable (PostHog / Plausible / console / none) |
| Forms      | React Hook Form + Zod (same schemas validate client and server) |
| Tests      | Vitest (+ ical.js as an independent RFC 5545 reference) |

## Architecture in one screen

```
Browser ──► Server Components / Server Actions (auth on every call)
              │
              ├─ Repositories (Supabase under RLS | demo JSON file) ── same interface
              │    plans · intakes · calendar · billing · check-ins
              │
              ├─ Generation: request row → after() → worker (service role)
              │    entitlement check → Gemini → Zod → checks → repair → care note → save
              │
              ├─ Billing: checkout (pending purchase) → Dodo → webhook / server-side
              │    payment lookup → fulfil_purchase() → routine credit → reserve on submit
              │
              └─ Calendar: CalendarEvent model → .ics | Google (diff sync, no duplicates)
```

Deeper docs: **[docs/generation.md](docs/generation.md)** (AI pipeline) · **[docs/calendar.md](docs/calendar.md)** (calendar, Today, lifecycle) · **[docs/billing.md](docs/billing.md)** (payments, entitlements, webhooks) · **[docs/privacy.md](docs/privacy.md)** (data handling, analytics, security review).

---

## Local setup

Requires **Node.js 20.9+**.

```bash
npm install
cp .env.example .env.local
npm run dev
```

**No Supabase yet?** With Supabase variables unset, `npm run dev` runs in **demo mode**: you're signed in as a demo user, data lives in `.demo-data/` (git-ignored), routines are built by a local rule-based builder when `GEMINI_API_KEY` is unset, and checkout is **simulated** (clearly labelled, no money moves). Demo mode can never switch on while Supabase is configured. Delete `.demo-data/` to start fresh.

## Supabase

1. Create a project at [supabase.com](https://supabase.com/dashboard).
2. **Project Settings → API Keys**: copy the project URL, the **publishable** key and the **secret** key into `.env.local`.
3. **Apply migrations** (in filename order):
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
   Or paste each file in `supabase/migrations/` into the SQL editor, in order. Migrations:
   | File | Adds |
   | --- | --- |
   | `20260928…_initial_schema` | profiles, manifestations, plans |
   | `20260929…_manifestation_intake` | intake tables, generation requests |
   | `20260930…_commitment_overlap` | per-activity manifestation overlap |
   | `20261001…_plan_generation` | plan versions, AI request kinds, worker functions |
   | `20261002…_calendar_and_lifecycle` | calendar exports/sync, check-ins, lifecycle, manifested archive |
   | `20261003…_billing_and_account` | purchases, entitlements, webhook idempotency, intake defaults |
   | `20261004…_security_hardening` | removes direct plan/request writes (paywall integrity) |
4. **Authentication → URL Configuration**: Site URL = your origin; Redirect URLs include `<origin>/auth/callback`.
5. Optional for local dev: turn off **Confirm email** so signup goes straight in.
6. After schema changes on a linked project you can regenerate types with `npm run db:types` (the checked-in `src/types/database.ts` mirrors the migrations by hand).

## Gemini

Create a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → `GEMINI_API_KEY` (server-only). `GEMINI_MODEL` defaults to `gemini-3.8-flash`. Intake answers are sent to Gemini to build routines — review the data-use terms of the API tier you use (see the Privacy page draft). `npm run test:live` runs a live evaluation across fixtures.

## Dodo Payments

1. In the Dodo dashboard (start in **Test mode**), create a **one-time product** — e.g. "Personalised routine" — and copy its id → `DODO_PRODUCT_ROUTINE`.
2. **Developer → API Keys** → `DODO_PAYMENTS_API_KEY`; set `DODO_PAYMENTS_ENVIRONMENT=test_mode` (or `live_mode` with a live key).
3. **Developer → Webhooks → Add endpoint**: `https://assume-day.vercel.app/api/webhooks/dodo`, subscribe to `payment.succeeded`, `payment.failed`, `payment.cancelled`, `refund.succeeded` (and `subscription.*` when you add a subscription). Copy the signing secret → `DODO_PAYMENTS_WEBHOOK_KEY`.
4. Set the **display** price: `BILLING_ROUTINE_PRICE` (minor units, e.g. `1900`) and `BILLING_CURRENCY`. Keep it equal to the Dodo product price; if unset the UI shows "price shown at checkout".
5. Local webhook testing: expose your dev server (e.g. a tunnel) and register that URL as a test-mode endpoint.

`BILLING_MODE=free` disables the paywall (private beta); `FREE_ROUTINE_CREDITS=1` gives every account one free routine. Details: [docs/billing.md](docs/billing.md).

## Google Calendar (optional)

Google Cloud Console → enable **Google Calendar API** → OAuth consent screen with the single scope `…/auth/calendar.app.created` (sensitive: needs Google verification for public launch; add testers meanwhile) → **Web application** OAuth client with redirect URI `<origin>/api/calendar/google/callback` (one per environment). Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CALENDAR_TOKEN_KEY` (`openssl rand -base64 32`). Without them, `.ics` export works on its own. See [docs/calendar.md](docs/calendar.md).

## Analytics (optional)

`ANALYTICS_PROVIDER=posthog` (+ `POSTHOG_API_KEY`, `POSTHOG_HOST`), `plausible` (+ `PLAUSIBLE_DOMAIN`), `console` (logs events) or `none`. Set `ANALYTICS_SALT`. Events are an allow-list of enums/numbers — never text people write. See [docs/privacy.md](docs/privacy.md).

## Environment variables

See **`.env.example`** for the complete, commented list.

| Variable | Required | Scope |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Yes (prod) | public |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Recommended | public |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | public |
| `SUPABASE_SECRET_KEY` | Yes | server |
| `GEMINI_API_KEY` (`GEMINI_MODEL`, `GEMINI_TIMEOUT_MS`) | Yes | server |
| `BILLING_MODE`, `FREE_ROUTINE_CREDITS` | No (defaults: required, 0) | server |
| `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_WEBHOOK_KEY`, `DODO_PAYMENTS_ENVIRONMENT`, `DODO_PRODUCT_ROUTINE` | Yes to sell | server |
| `BILLING_ROUTINE_PRICE`, `BILLING_CURRENCY` | Recommended | server |
| `DODO_PRODUCT_SUBSCRIPTION`, `BILLING_SUBSCRIPTION_PRICE`, `BILLING_SUBSCRIPTION_INTERVAL` | Future tier | server |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CALENDAR_TOKEN_KEY` | For Google sync | server |
| `ANALYTICS_PROVIDER`, `ANALYTICS_SALT`, `POSTHOG_*`, `PLAUSIBLE_*` | Optional | server |
| `ASSUME_DEMO_MODE` | Optional | server |

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm run start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | Route type generation + `tsc` |
| `npm test` | Offline test suite (Vitest) |
| `npm run test:live` | Live Gemini evaluation (needs a key) |
| `npm run check` | Lint + typecheck + tests + build |

## Testing

`npm test` runs everything offline: AI pipeline and checks, prompts, the generation runner against the demo store, calendar recurrence (cross-checked with ical.js), Google sync against a fake Google API, Today, lifecycle, billing (webhook signatures, idempotency, refunds, credit double-spend), entitlements, safety guards, log redaction and analytics allow-listing.

## Production deployment

Live at **https://assume-day.vercel.app**. The URLs every dashboard needs:

| Where | Value |
| --- | --- |
| Vercel env `NEXT_PUBLIC_SITE_URL` | `https://assume-day.vercel.app` |
| Supabase → Auth → Site URL | `https://assume-day.vercel.app` |
| Supabase → Auth → Redirect URLs | `https://assume-day.vercel.app/auth/callback`, `http://localhost:3000/auth/callback` |
| Google OAuth client → Redirect URIs | `https://assume-day.vercel.app/api/calendar/google/callback`, `http://localhost:3000/api/calendar/google/callback` |
| Google consent screen → Home / Privacy / Terms | `https://assume-day.vercel.app`, `…/privacy`, `…/terms` |
| Google consent screen → Authorized domain | `assume-day.vercel.app` |
| Dodo → Webhook endpoint | `https://assume-day.vercel.app/api/webhooks/dodo` |

Without `NEXT_PUBLIC_SITE_URL`, Vercel production falls back to `VERCEL_PROJECT_PRODUCTION_URL` (never the per-deployment `VERCEL_URL`), but setting it explicitly is recommended.


1. Create the Supabase project, apply all migrations, configure Auth URLs (table above).
2. Set every required environment variable on your host (e.g. Vercel → Project → Settings → Environment Variables). Never expose server-only keys as `NEXT_PUBLIC_`.
3. Deploy (`npm run build` must pass — `npm run check` runs everything).
4. Dodo: create the live product, live API key, and the **live** webhook endpoint → set `DODO_PAYMENTS_ENVIRONMENT=live_mode`.
5. Google (if used): add the production redirect URI; verify ownership of `assume-day.vercel.app` in Search Console (HTML-tag method → `GOOGLE_SITE_VERIFICATION`), then submit OAuth verification.
6. Allow long-running functions: generation routes set `maxDuration = 300` (needs a plan that supports it, e.g. Vercel Pro/Fluid).
7. Smoke test: sign up → intake → checkout (test card in test mode first) → routine → calendar → Today → mark manifested → delete a test account.

## Project structure

```
src/
  app/
    (marketing)/     Landing, terms, privacy, contact
    (auth)/          Login, signup, password reset
    (app)/           Signed in: home (Today), plans, plan page, manifested archive, settings
    (flow)/          Full-screen: intake wizard, generating, checkout (+ success/cancelled)
    api/             generation status/nudge · calendar (.ics, Google OAuth) · webhooks/dodo · analytics
    opengraph-image, twitter-image, sitemap, robots, manifest
  components/        ui/ (design system) · marketing · intake · plan · calendar · today · billing · settings · legal
  content/           Marketing, intake and billing copy
  lib/
    ai/              Gemini client, prompts, schemas, safety (care themes)
    generation/      Pipeline (parse → check → repair), runner, usage
    plan/ intake/    Domain models, Zod schemas, stores (Supabase + demo)
    calendar/        Event model, timezones, .ics, Google, sync, status
    billing/         Config (prices), Dodo client + webhooks, stores, service
    today/           Agenda + check-ins
    analytics/       Event allow-list, server tracker, client beacon
    entitlements.ts  Who may generate; rate limits
    log.ts           Redacting logger
supabase/migrations/ SQL (RLS on every table)
docs/                generation · calendar · billing · privacy
```

## Design system

- **Palette** — warm paper `#f5f1e8`, ink `#121110`, white surfaces, one accent: **Signal** `#ff5a1f` (a fill; text on accent is ink; `accent-ink` for accent-coloured text).
- **Shadows** — hard, unblurred ink offsets (`shadow-hard-xs … xl`). **Radius** — restrained (2–14px).
- **Type** — Bricolage Grotesque display, Geist UI, Geist Mono labels.
- **Interaction** — buttons lift on hover and sink on press; inputs lift on focus; all motion respects `prefers-reduced-motion`. Mobile sheets are native `<dialog>` bottom sheets (focus trapping, Escape).

## Email templates (Supabase)

Supabase's default email links use PKCE, which only works if the link is opened in the **same browser** that requested it. Links opened on another device, or in an email app's in-app browser, fail. Use token-hash links instead, handled by `/auth/confirm`, which work anywhere.

In **Supabase → Authentication → Emails (Templates)**, change the link in each template:

| Template | Link |
| --- | --- |
| Confirm signup | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/home` |
| Reset password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password` |
| Magic link (if used) | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/home` |
| Change email address | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/settings` |

`{{ .SiteURL }}` is the Site URL under Authentication → URL Configuration (e.g. `https://assume-day.vercel.app`).

## Database

Every user-owned table has Row Level Security with owner-only reads; writes that affect money or AI go through narrow `security definer` functions or the service role. Deleting an auth user cascades to all personal data; purchase records are kept unlinked.

> **New tables need explicit grants.** Supabase projects no longer auto-grant new tables to the API roles, so every migration that creates a table must `grant` to `authenticated` exactly the operations its RLS policies allow (the service role is covered by default privileges from `20261004000000_api_role_grants.sql`). `tests/migrations.test.ts` fails if a table is left without privileges.

| Table | Purpose |
| --- | --- |
| `profiles` | Name, timezone, calendar privacy defaults, intake defaults |
| `manifestations` | What someone is manifesting |
| `manifestation_intakes` + `schedule_preferences`, `recurring_commitments`, `technique_preferences`, `affirmations` | The intake |
| `plan_generation_requests` | Queued AI work with a frozen snapshot |
| `plans`, `plan_versions` | Current routine + full history |
| `calendar_exports`, `calendar_connections`, `calendar_connection_secrets`, `calendar_event_links` | Calendar export/sync state; encrypted tokens (service role only) |
| `session_checkins` | Done / Skip / Move today |
| `manifested_entries` | The manifested archive |
| `purchases`, `entitlement_grants`, `webhook_events` | Billing, credits/subscriptions, webhook idempotency |
# Assume

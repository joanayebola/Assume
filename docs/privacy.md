# Privacy & security review

People tell Assume about relationships, money, health and their daily schedule. This is how that's protected.

## Authorization

- **RLS on every table**, owner-only reads. Users can never read another person's manifestation, intake, routine, affirmations, schedule, calendar data, purchases or entitlements.
- **Writes that matter go through narrow functions**: plan edits/restores/status/deletion (`security definer`, ownership-checked), generation requests (initial only via intake submission; adjustments via `request_plan_change`, params capped at 4 KB), credits and purchases (service role only). Since `20261004_security_hardening`, users can't insert or edit `plans` rows directly — closing a path to free generated routines.
- **Secrets**: OAuth tokens live in `calendar_connection_secrets` (no RLS policies → service role only) and are AES-256-GCM encrypted with `CALENDAR_TOKEN_KEY`. Webhook ids live in `webhook_events` (service role only).
- **Every Server Action and API route** authenticates the user and validates input with Zod (length limits everywhere); ids come from the verified session, never the client.
- **Service keys** (`SUPABASE_SECRET_KEY`, Gemini, Dodo, Google) are server-only; none are `NEXT_PUBLIC_`.

## What leaves the server

| Destination | What | Not |
| --- | --- | --- |
| Gemini | The intake snapshot (desire, circumstances, preferences, schedule, notes) needed to build the routine | Name, email, account ids |
| Dodo Payments | Product id, email/name for the receipt, `purchase_id` | Anything from the intake |
| Google Calendar | Only what the person chose: title style, optional details | Anything else |
| Analytics | Allow-listed event names + enum/number props, HMAC-hashed user id | Any text people write |

## Logs

`src/lib/log.ts` logs errors by **shape** in production: name, code, status, and a redacted message (quoted strings, Postgres "Failing row contains", key values removed). Generation failures store a redacted message in `error_message`. Dodo responses are never logged. Client error boundaries show only a reference digest — never stack traces.

## Analytics

Server-side only (no client SDK, no cookies, no session replay). `src/lib/analytics/events.ts` defines every event and its exact property schema; unknown props are stripped and invalid ones drop the event. Anonymous landing events use a per-tab random id in `sessionStorage`. PostHog events are sent with `$process_person_profile: false`.

Events: landing CTA clicked, signup completed, intake started / step completed / completed, generation started / succeeded / failed, checkout started, purchase completed, plan viewed, plan edited (op type), routine exported (provider, count), calendar connected, manifestation completed.

## AI safety

- Principles forbid guarantees, deadlines, science claims, unsafe behaviour and discouraging real-world help.
- Mechanical checks (`src/lib/plan/checks.ts`) reject guarantee/science/medical-cure language and anything discouraging doctors, therapy, medication, lawyers, police or emergency services — the model gets one repair round, then the plan fails safely (intake preserved, credit returned if it can't be built).
- `src/lib/ai/safety.ts` detects health, legal, safety or money-pressure themes server-side, tells the model to keep the practice *alongside* real-world help, and guarantees one gentle sentence in "How to use this" if the model didn't write one. No warning screens.
- Malformed model output is never rendered: Zod parse → retry with the reason → checks → repair → safe auto-fixes → re-check, else a friendly retryable failure.

## Account deletion

Settings → Delete account (type DELETE). Revokes Google access (optionally deletes the Assume calendar), deletes the auth user → cascades to all personal data. Purchase rows are kept with `user_id = null` for accounting (confirm the retention period in legal review).

## Open items for legal review

Terms and Privacy pages are structured drafts with [bracketed] placeholders: company details, jurisdiction, legal bases, refund policy, retention periods, minimum age, Gemini API data-use terms, Dodo merchant-of-record wording.

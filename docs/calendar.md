# Calendar, Today and plan lifecycle

How Assume turns a routine into calendar events, keeps them in step with edits, and shows today's sessions.

## Event model

`src/lib/calendar/model.ts` builds provider-independent `CalendarEvent`s from a plan. One routine session = one recurring event. Each event has:

| Field | Notes |
| --- | --- |
| `uid` | `<planId>-<sessionId>@assume` — stable across exports |
| `title` | Privacy-safe display title (see below) |
| `description` / `url` | Only the details the person chose; `null` when none |
| `internal` | Full session details, never sent unless chosen |
| `timezone`, `start`, `end` | Wall-clock times in the **plan's** IANA zone; `end` rolls to the next day for past-midnight sessions |
| `recurrence` | `DAILY`, or `WEEKLY` + `BYDAY`; optional inclusive `until` date |
| `reminderMinutes` | `null` = none |
| `fingerprint` | Hash of everything a calendar shows — used for change detection |

Sync state (provider, external ids, current/out-of-date) lives beside it in `calendar_exports` and `calendar_event_links`.

## Privacy

Title styles: **Descriptive** (session name), **Private** ("Manifestation session", the default), **Very private** ("Personal time"), **Custom**. Descriptions can include instructions, affirmations, the visualization scene and a link back — all off by default except the link. Events are exported `CLASS:PRIVATE` / Google `visibility: private`, and **transparent** (they don't mark you busy — sessions often ride along with a commute or walk). Downloaded files are always named `assume-routine.ics`.

## Timezones and DST

`src/lib/calendar/zoned.ts` does all wall-clock ↔ instant maths with `Intl` only:

- Times are stored as wall-clock in the plan's zone and **rendered in the viewer's profile zone** (Today, next session).
- Spring-forward gaps shift forward; fall-back overlaps take the first occurrence — RFC 5545 §3.3.5, which Apple and Google follow.
- `.ics` files carry a generated `VTIMEZONE` (yearly `RRULE`s where the zone follows a rule, explicit dates otherwise), so events stay at 7:30 across DST for years.
- A routine's timezone can be changed from the plan page (sessions keep their wall-clock times).
- Signup now records the browser's timezone; Today offers to switch when the device and profile disagree.

## Export paths

**.ics (Apple Calendar, Outlook, Google import…)** — `prepareIcsExport` validates and records the export, then the browser opens `GET /api/calendar/plans/:id/ics?o=…` (authenticated, `no-store`). On iPhone this goes straight to "Add All".

Imported files can't be updated remotely. After an edit, the plan page says so plainly and offers a fresh file; the sheet warns before a duplicate import.

**Google Calendar** — explicit "Connect", OAuth 2.0 with PKCE, scope **`calendar.app.created` only**: Assume creates its own "Assume" calendar and can't see or touch any other calendar. Tokens are AES-256-GCM encrypted (`CALENDAR_TOKEN_KEY`) in `calendar_connection_secrets`, which only the service role can read.

Sync is a diff by session id (`src/lib/calendar/sync.ts`): create / update / remove, with deterministic event ids so retries never duplicate. It self-heals when someone deletes an event or the whole calendar in Google, records only successful operations (so partial failures are safely retryable), and marks the connection "needs reconnect" when access is revoked. After an edit: **"Your routine changed. Update calendar?"**

## Today

`src/lib/today/agenda.ts` lists occurrences from active plans that start during the viewer's local day. **Done**, **Skip** and **Move today** are stored per occurrence in `session_checkins` (a move is an absolute instant). No streaks, counts or "missed" states exist anywhere. Empty: "Nothing scheduled today. Live your life."

## Lifecycle

Pause / resume, archive / restore, duplicate, delete and mark as manifested (`set_plan_status`, `duplicate_plan`, `delete_plan` SQL functions). Pause, archive, complete and delete can also remove the plan's Google events. Completed plans can be saved to the **manifested archive** (`manifested_entries`, `/manifested`).

## Google setup

1. Google Cloud Console → create a project → enable the **Google Calendar API**.
2. OAuth consent screen: add the scope `.../auth/calendar.app.created`. It's a *sensitive* scope: for public use Google requires app verification; while in "Testing", add your testers.
3. Credentials → OAuth client ID → **Web application**. Authorized redirect URI: `<NEXT_PUBLIC_SITE_URL>/api/calendar/google/callback` (one per environment).
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CALENDAR_TOKEN_KEY` (`openssl rand -base64 32`). `SUPABASE_SECRET_KEY` must also be set (it guards token storage).

Rotating `CALENDAR_TOKEN_KEY` invalidates stored tokens; people will be asked to reconnect.

## Tests

`tests/calendar.test.ts` cross-checks every recurrence case against **ical.js** (an independent RFC 5545 implementation): daily, selected weekdays, weekend-only, hourly plans, past midnight, end dates, UTC and ±half-hour zones, northern/southern DST, and years-later correctness. ical.js deviates from RFC 5545 only on the single transition night (ambiguous/non-existent local times); those tests pin the RFC answer. `tests/sync.test.ts` runs the real Google service against an in-memory fake of the Google REST API. `tests/today.test.ts` and `tests/lifecycle.test.ts` cover Today and plan states.

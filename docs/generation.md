# Routine generation

How Assume turns an intake into a personalised routine with Gemini — and why the model is never trusted on its own.

## Pipeline

```
Build my routine / Adjust / Regenerate session
        │  server action (auth + entitlement + daily limit)
        ▼
plan_generation_requests  (status: queued, input_snapshot, kind, params)
        │  after() → runGenerationRequest()            ◄── POST /api/generation/:id "nudge"
        ▼                                                  (if nothing picked it up)
claim  (atomic; stale "processing" claims are re-claimable after 4 min)
        ▼
Gemini  — generateContent with responseMimeType: application/json
          + responseJsonSchema (strict structured output)
        ▼
Zod parse (src/lib/ai/schema.ts)          ── malformed → retry once with the reason
        ▼
Convert to PlanDoc (src/lib/plan/build.ts)
        ▼
Sanity checks (src/lib/plan/checks.ts)    ── problems → retry once with each problem listed
        ▼                                     still failing → safe automatic fixes → re-check
complete_generation_request()  — one transaction: plan + version + request status
        ▼
/plans/generating/:id polls GET /api/generation/:id → redirects to /plans/:planId
```

Gemini is only called for these three actions. Viewing and editing a plan never calls it.

## Configuration

| Variable | Required | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes (production) | Server-only. Without it, generation reports "not switched on" (demo mode uses the local builder instead). |
| `GEMINI_MODEL` | No | Default `gemini-3.8-flash`, the current stable Flash model at the time of writing. |
| `GEMINI_TIMEOUT_MS` | No | Per request, 10 000–300 000. Default 90 000. The whole run is capped at 240 s. |
| `SUPABASE_SECRET_KEY` | Yes (production) | Server-only. The worker uses it to call the three worker SQL functions; users can't write results themselves. `SUPABASE_SERVICE_ROLE_KEY` also works. |

The official `@google/genai` SDK is used with its built-in retries disabled — the pipeline owns retries and repair, so failures never silently multiply.

## Structured output: what the model returns

Defined in `src/lib/ai/schema.ts` and sent to Gemini as JSON Schema (`toGeminiJsonSchema` drops keywords Gemini doesn't support; Zod still enforces them on parse). The shape is flat and null-free: empty strings and empty arrays mean "not applicable".

**Plan** (`aiPlanSchema`)

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string ≤ 100 | |
| `explanation` | string ≤ 800 | 2–3 personal sentences. No minute totals (the app computes those). |
| `philosophy` | string ≤ 1200 | Gentle framing: tools, not tests. |
| `generatedAffirmations` | string[] ≤ 8 | Only when the user asked for help writing affirmations. |
| `generatedAskfirmations` | string[] ≤ 6 | Questions. |
| `patterns` | `{ label, days[], summary }`[] 1–7 | How different kinds of days work ("Workdays", "Shift nights", "Weekends"). |
| `sessions` | Session[] 1–40 | |

**Session** (`aiSessionSchema`)

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string ≤ 80 | |
| `technique` | enum | `affirmations`, `askfirmations`, `visualization`, `sats`, `scripting`, `subliminals`, `inner_conversations`, `revision`, `meditation`, `other` |
| `customTechniqueLabel` | string | Only for `other`. |
| `days` | int[] 1–7 | ISO weekdays, 1 = Monday. |
| `startTime` | `HH:MM` | 24-hour, user's local time. |
| `durationMinutes` | int 1–180 | |
| `flexibleTiming` | boolean | The exact time can move within its window. |
| `optional` | boolean | Nice-to-have; not counted in the daily time. |
| `recurrenceLabel` | string | Human label; the app derives `recurrence` from `days`. |
| `instructions` | string ≤ 1200 | 1–4 plain sentences. |
| `affirmations` | string[] ≤ 12 | Texts used in this session — the user's own wording first. |
| `askfirmations` | string[] ≤ 12 | Each ends in "?". |
| `visualizationPrompt` | string | Visualization, SATS, revision. |
| `scriptingPrompt` | string | Scripting. |
| `notes` | string ≤ 600 | |
| `contextActivity` | string | The activity it rides along with (e.g. "Commute"). |
| `fitReason` | string ≤ 400 | Why this slot fits this person — shown as "Why this fits here". |

Regenerating one session uses the Session schema alone; adjusting uses the full Plan schema.

## The stored plan (`PlanDoc`, `src/lib/plan/schema.ts`)

Model output is converted into the app's own document (`plans.routine`, `plan_versions.document`, `docVersion: 1`). Differences from the model's shape:

- Sessions get stable ids; `recurrence` (`daily` / `weekdays` / `weekends` / `custom`) is derived from `days`.
- Affirmations and askfirmations live in a library (`{ id, text, source: user | generated | custom }`) and sessions reference them by id. The user's own affirmations are reused verbatim, never duplicated.
- `manifestationId`, `origin` (`generated` | `custom`) and `userEdited` are added. Edited sessions are left alone by adjustments unless the user opts in.
- Daily time is computed from sessions (`minutesByDay`, `dailyMinutesRange`), never taken from the model.

## Sanity checks

`checkPlan()` verifies everything that can be verified mechanically:

| Check | Automatic last-resort fix |
| --- | --- |
| Avoided technique used | Remove the session |
| Affirmations when the user chose "none" | Remove sessions / clear lists |
| The user's own affirmations ignored | Use their affirmations |
| Session outside waking hours (overnight-aware; weekend hours exempt when weekends differ) | Remove the session |
| SATS not near bedtime | Remove the session |
| Overlaps an activity marked "can't manifest" | Remove the session |
| Technique not allowed during an activity marked "for some things" | Remove the session |
| Eyes-closed/writing technique during a commute the user said "yes" to (they may be driving) | Remove the session |
| Two sessions overlap | Remove the later one |
| Any day over the time budget (optional sessions don't count) | Trim the longest sessions |
| Visualization/SATS/scripting without a prompt | Use the instructions as the prompt |
| Guarantees, science claims, streaks, "if you miss…", "you must stay positive" | Remove the offending sentences |
| Light style with > 3 sessions a day; hourly style with < 4 | — (fed back to the model) |

## Versions and edits

- Every AI change creates a new version (`generated`, `adjusted`, `session_regenerated`). User edits create a `user_edit` version; consecutive edits within 10 minutes are merged into one.
- Restoring adds the old version as the newest one; nothing is deleted.
- Edits are small operations (`src/lib/plan/edits.ts`) applied on the server to the latest version, with optimistic concurrency. If the plan changed in another tab, or a generation finished meanwhile, the edit is refused and the latest version is loaded. The worker rebuilds once if the user edited the plan during generation.

## Entitlements (Phase 5)

`checkGenerationEntitlement()` in `src/lib/entitlements.ts` is called when a request is created and again by the worker, which has the final say. Today it only enforces a 30-requests-per-day ceiling. Stripe subscriptions or credits plug in there.

## Testing

```bash
npm test            # offline: checks, pipeline, runner, prompts, edits (no API key needed)
npm run test:live   # real Gemini on every fixture (needs GEMINI_API_KEY; costs tokens)
```

Fixtures (`tests/fixtures/users.ts`): office worker (the brief's example), university student with a deadline and different weekends, night-shift nurse, stay-at-home parent on 5–10 minutes, freelancer, a minimal 5-minute plan, no affirmations, an hourly preference, and conflicting schedule data.

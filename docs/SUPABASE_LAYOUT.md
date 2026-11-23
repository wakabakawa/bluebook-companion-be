# `supabase/` folder structure and feature usage

## Top level

| File | Purpose |
|---|---|
| `config.toml` | Local-dev settings - ports, which services are on, `[auth] enable_anonymous_sign_ins = true`. `supabase config push` syncs this to the remote project too. |
| `.gitignore` | Excludes `.branches`/`.temp` (CLI runtime state, not project config). |
| `.branches/_current_branch` | CLI-managed, tracks the active Supabase "branch" - not authored or touched directly. |

## `migrations/` - Postgres + Row Level Security

Twelve timestamped SQL files, applied in order by `supabase db push`/`supabase start`. Each is
append-only history - never edit an applied one, add a new file instead. The last two below
supersede parts of `views.sql`/`functions.sql` (`drop ... create ...`), so those originals no
longer fully describe the live schema - check the newest migration touching a given object first.

| File | What it builds |
|---|---|
| `content_tables.sql` | `edition`, `classification`/`classification_value` (generic subject/branch/topic/difficulty vocabulary), `exam_set`, `item`, `is_admin()`, and RLS for all of these. |
| `confidential_answer_keys.sql` | `app_private.answer_key_version`/`answer_key_item` - in a schema PostgREST never exposes, RLS enabled with zero policies on top. Four independent layers block access (verified: direct queries return `PGRST205`, not a permission error). |
| `attempts.sql` | `local_profile` (PK = `auth.uid()` directly), `attempt`, `item_response`. RLS lets students read only their own rows; no INSERT policy anywhere - only `submit_attempt()` can write. |
| `statistics.sql` | Raw `item_statistics`/`exam_set_statistics` (admin-only) feeding published projection tables `topic_catalog`/`topic_cohort` (readable by any authenticated student - gating is "does a row exist", not a check a client could bypass). |
| `operations.sql` | `planner_config` (the DP's tunable parameters, `CHECK` constraints mirroring `engine/review-planner/types.ts`), `engine_job` (empty queue, no producer yet), `audit_record` (append-only via trigger). |
| `views.sql` | Original `v_topic_stats`/`v_sheet_catalog`/`v_sheet_items`, all `security_invoker = true` - the setting that makes RLS actually apply to a view. Superseded in part below. |
| `functions.sql` | `refresh_rollups()` (recomputes catalog/cohort projections), `submit_attempt()` (the only code that ever reads the answer key), `admin_publish_answer_key()`. Superseded in part below. |
| `ensure_profile.sql` | Found while testing: a brand-new user with no submitted attempts had no `local_profile` row, so they got an empty plan instead of a cold-start one. This RPC fixes that. |
| `fix_catalog_view_and_tighten_grants.sql` | Fixes a real bug: `v_sheet_catalog` (security_invoker) joined `app_private.answer_key_version` to derive `key_version_id`, which meant every real student request failed with "permission denied" - `authenticated` has zero grants on `app_private` by design. Drops that column from the view; `submit_attempt()` is dropped and recreated with `key_version_id` added to its own return instead (the correct place for it, since it's already the function that resolves the published version). Also closes a real gap: `refresh_rollups()` had no `revoke`/`grant` at all, so Postgres's default (`EXECUTE` to `PUBLIC`) left it callable by anyone, including `anon`, via `rpc/refresh_rollups` - restricted to `service_role`. |
| `add_ref_seconds_to_sheet_items.sql` | Drops and recreates `v_sheet_items` adding `ref_seconds` (`coalesce(item.ref_seconds_override, difficulty.ref_seconds, 60)`, same precedence `refresh_rollups()` already uses) - FR17/CC03, lets the Android app compare each item's answer time against its own reference instead of one flat constant. Only joins `item`/`classification_value`, never `app_private`, so it can't reintroduce the bug above. |
| `remove_answer_key_reveal.sql` | Resolves the FR11-vs-SEC-11 tension in favor of SEC-11. Drops and recreates `submit_attempt()` removing `correct_choice` from its return shape entirely - the key is still read internally to compute `is_correct`, but the output path never touches `app_private` or reveals the answer. Also drops the now-pointless `planner_config.reveal_key_after_submit` column. |
| `drop_selected_choice_from_submit_attempt.sql` | Shrinks the response further: drops `selected_choice` (the student's own submitted letter) too - the client already has its own answers in the local draft, so it doesn't need the server to echo them back at all. `submit_attempt()` now returns only `(position, is_correct, key_version_id)` - nothing answer-shaped whatsoever. |

## `seed/` - populates and exercises the live Postgres data (not under `supabase/`, but nothing else touches this DB directly)

Connects straight to Postgres via `DB_URL` (bypassing PostgREST/RLS entirely - these are
trusted, local/dev-only scripts, never shipped or run against a device). `npm run seed:catalog`
then `seed:answer-key` must run in that order; `seed:cohort` requires both to have already run.

| File | Purpose |
|---|---|
| `db.ts` | `connect()` - reads `DB_URL` from `.env` (`process.loadEnvFile()`) or a real exported env var, falls back to the local Supabase stack's default connection string. The only shared module; every other seed script imports just this. |
| `catalog.ts` | Seeds the one `edition`, the classification vocabulary (subject/branch/topic/key-concept/cognitive-skill/difficulty), and all 21 `exam_set` rows (Set A/B/C x 7 branches) with real per-item topic/key-concept/difficulty/book-page tags. Every branch gets the same item count within its set (Set A = 10/topic, Set B = 30/topic, Set C = 40/topic) and is published (`published_at`) - Set A/Geometry is the one exception, left untouched since it already carries real attempt/cohort history with no cascade-delete path. Ends by calling `refresh_rollups()`. |
| `answer_key.ts` | Publishes an `app_private.answer_key_version`/`answer_key_item` for every exam_set `catalog.ts` published. Set A/Geometry keeps its original, already-demoed key (`GEOMETRY_KEY`); every other branch gets a deterministic per-branch key (a hash of the branch code + position) - reproducible rather than invented fresh each run, since there's no real answer-key source for this sample content. |
| `cohort.ts` | Seeds 300 fake readers' attempts on Set A/Geometry so FR22's Cohort Comparison clears BR09's release threshold (`planner_config.cohort_min_attempts`). Each fake reader is a real `auth.users` row shaped exactly like a genuine anonymous sign-in (verified against a real one), not a stand-in table, so it satisfies every FK/RLS policy a real student would. Spreads accuracy randomly (25-95%) across readers so Above/Near/Below-average all show up on the comparison screen. Ends by calling `refresh_rollups()`. |

## `engine/review-planner/` - the algorithm (not under `supabase/`, but deployed into it)

Pure TypeScript, no I/O. This is the canonical source - `npm run sync-engine` compiles it and
copies the output into `functions/_shared/engine/` below, which is what `plan-gateway` actually
runs in production. `api/`'s standalone Fastify server also imports it directly, but that server
isn't deployed or called by the real app (the Android client only ever invokes `plan-gateway`) -
it exists for local dev/testing only, exercised by `tests/contract.test.ts`.

| File | Purpose |
|---|---|
| `types.ts` | All shared shapes: `TopicStat` (raw per-topic input - answered count, correct count, days since last practice, cohort mastery, reference seconds), `Params`/`DEFAULT_PARAMS` (the DP's tunable knobs), `ScoredTopic` (post-scoring, see `priorities.ts`), `Certificate`/`PlanEntry`/`Metrics` (the solver's full output), `InputError`. |
| `priorities.ts` | `validateInput()` (range/shape checks) and `computePriorities()` - the real math. Mastery `mu` is a shrinkage estimate, not a raw percent: `(c + priorStrength * pi) / (a + priorStrength)`, where `pi` is the topic's cohort mastery (or `defaultPrior` if not yet released) - so a topic with only 1-2 answered items doesn't swing to 0% or 100%. Staleness `r` is exponential decay off `daysSincePractice` with a `halfLifeDays` half-life. Time cost `k` and knapsack value `v` (`N * (w + recencyWeight * r)`) are derived here too. |
| `knapsack.ts` | `solveDp()` - the production solver. Cardinality-constrained 0/1 knapsack DP (PDF §2.2-2.3): maximize total value within a time budget while requiring at least `minStrong` "strong" (reliable + above-threshold-mastery) topics. Rolling 2D rows plus a bit-table for reconstruction, not a full 3D table, to stay inside `plan-gateway`'s 1500ms timeout. |
| `reference.ts` | `solveDpReference()` - a scalar oracle: the same DP, but a full 3D table with plain nested loops, no rolling rows or typed arrays. Test-only, used to verify `solveDp()`'s optimality - never deployed. |
| `baselines.ts` | `bruteForce()` (exhaustive 2^n subset search, test oracle only, capped around n~20) and `greedyRatio()` (literature-baseline greedy by value/cost density, ignores the `minStrong` constraint entirely). Both exist purely so tests can prove the DP beats naive approaches - neither is deployed. |
| `service.ts` | `planReview()` - the public entrypoint. Validates input, scores priorities, handles the `EMPTY_INPUT`/`BUDGET_TOO_SMALL` edge cases, runs `solveDp()`, reconstructs the ranked `PlanEntry[]` (sorted by value/cost density), and attaches warnings (relaxed `minStrong`, missing cohort prior) plus solve metrics. |
| `index.ts` | Barrel file - re-exports everything for `api/` and (after compilation) `functions/_shared/engine/`. |

## `functions/plan-gateway/` - Edge Functions

| File | Purpose |
|---|---|
| `index.ts` | Deployed entrypoint. Reads env (`SUPABASE_URL`/`SUPABASE_ANON_KEY`, auto-injected), builds a Postgres client that forwards the caller's own JWT (never the service-role key), wires it into the handler. Wrapped in `withSupabase({ auth: ["publishable"] })`. |
| `handler.ts` | The logic, framework-agnostic: validate request → `ensure_profile` + read `v_topic_stats` → run the engine → map the result to JSON. Dependencies (DB fetch, clock) are injected rather than imported directly. |
| `deno.json` | Import map for the two non-inline packages (`@supabase/functions-js`, `@supabase/server`). |
| `.npmrc` | CLI-generated registry config for npm-specifier resolution. |

## `functions/_shared/` - our own convention, not a Supabase feature

Supabase's documented pattern for code shared between functions.

- **`engine/`** - the *compiled* output of `engine/review-planner/` (real `.js`, built by `npm run build`, copied by `scripts/sync-engine.ts`). Untouched algorithm, same 202 tests, now running in Deno instead of Node.
- **`gateway/`** - hand-written `.ts`: `wire-types.ts` (JSON shapes), `mappers.ts` (DB rows ↔ engine types ↔ response JSON), `validate.ts` (hand-rolled request checking - Ajv skipped since its codegen approach is unverified under this runtime), `problem.ts` (RFC 9457 error bodies), `engine-meta.ts` (version string, the 1500ms timeout constant).
- **`README.md`** - note that this directory is generated/vendored, don't hand-edit the `engine/` part.

## Supabase features used

| Feature | Where |
|---|---|
| Postgres | Every table in `migrations/` |
| Row Level Security | Every `enable row level security` + `create policy` statement |
| Database Functions (RPC) | `submit_attempt`, `ensure_profile`, `admin_publish_answer_key` (all `authenticated`-callable); `refresh_rollups` (`service_role` only - see `fix_catalog_view_and_tighten_grants.sql`) |
| Auth (Anonymous Sign-In) | `config.toml`'s `enable_anonymous_sign_ins`, consumed as `auth.uid()` throughout RLS/RPCs |
| PostgREST (auto-generated REST API) | How the Edge Function reads `v_topic_stats`; how RLS was tested directly via `curl .../rest/v1/...` |
| Edge Functions | `plan-gateway` |

Not used (deliberately): Storage (no file uploads in this design), Realtime (nothing live-pushes),
the service-role key via PostgREST - nothing in this repo calls `rpc/refresh_rollups` with it
today (the seed scripts connect directly to Postgres instead); the grant exists for a future
admin tool or scheduled job, not something currently exercised.

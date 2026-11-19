# `supabase/` folder structure and feature usage

## Top level

| File | Purpose |
|---|---|
| `config.toml` | Local-dev settings — ports, which services are on, `[auth] enable_anonymous_sign_ins = true`. `supabase config push` syncs this to the remote project too. |
| `.gitignore` | Excludes `.branches`/`.temp` (CLI runtime state, not project config). |
| `.branches/_current_branch` | CLI-managed, tracks the active Supabase "branch" — not authored or touched directly. |

## `migrations/` — Postgres + Row Level Security

Ten timestamped SQL files, applied in order by `supabase db push`/`supabase start`. Each is
append-only history — never edit an applied one, add a new file instead. The last two below
supersede parts of `views.sql`/`functions.sql` (`drop ... create ...`), so those originals no
longer fully describe the live schema — check the newest migration touching a given object first.

| File | What it builds |
|---|---|
| `content_tables.sql` | `edition`, `classification`/`classification_value` (generic subject/branch/topic/difficulty vocabulary), `exam_set`, `item`, `is_admin()`, and RLS for all of these. |
| `confidential_answer_keys.sql` | `app_private.answer_key_version`/`answer_key_item` — in a schema PostgREST never exposes, RLS enabled with zero policies on top. Four independent layers block access (verified: direct queries return `PGRST205`, not a permission error). |
| `attempts.sql` | `local_profile` (PK = `auth.uid()` directly), `attempt`, `item_response`. RLS lets students read only their own rows; no INSERT policy anywhere — only `submit_attempt()` can write. |
| `statistics.sql` | Raw `item_statistics`/`exam_set_statistics` (admin-only) feeding published projection tables `topic_catalog`/`topic_cohort` (readable by any authenticated student — gating is "does a row exist", not a check a client could bypass). |
| `operations.sql` | `planner_config` (the DP's tunable parameters, `CHECK` constraints mirroring `engine/review-planner/types.ts`), `engine_job` (empty queue, no producer yet), `audit_record` (append-only via trigger). |
| `views.sql` | Original `v_topic_stats`/`v_sheet_catalog`/`v_sheet_items`, all `security_invoker = true` — the setting that makes RLS actually apply to a view. Superseded in part below. |
| `functions.sql` | `refresh_rollups()` (recomputes catalog/cohort projections), `submit_attempt()` (the only code that ever reads the answer key), `admin_publish_answer_key()`. Superseded in part below. |
| `ensure_profile.sql` | Found while testing: a brand-new user with no submitted attempts had no `local_profile` row, so they got an empty plan instead of a cold-start one. This RPC fixes that. |
| `fix_catalog_view_and_tighten_grants.sql` | Fixes a real bug: `v_sheet_catalog` (security_invoker) joined `app_private.answer_key_version` to derive `key_version_id`, which meant every real student request failed with "permission denied" — `authenticated` has zero grants on `app_private` by design. Drops that column from the view; `submit_attempt()` is dropped and recreated with `key_version_id` added to its own return instead (the correct place for it, since it's already the function that resolves the published version). Also closes a real gap: `refresh_rollups()` had no `revoke`/`grant` at all, so Postgres's default (`EXECUTE` to `PUBLIC`) left it callable by anyone, including `anon`, via `rpc/refresh_rollups` — restricted to `service_role`. |
| `add_ref_seconds_to_sheet_items.sql` | Drops and recreates `v_sheet_items` adding `ref_seconds` (`coalesce(item.ref_seconds_override, difficulty.ref_seconds, 60)`, same precedence `refresh_rollups()` already uses) — FR17/CC03, lets the Android app compare each item's answer time against its own reference instead of one flat constant. Only joins `item`/`classification_value`, never `app_private`, so it can't reintroduce the bug above. |

## `functions/plan-gateway/` — Edge Functions

| File | Purpose |
|---|---|
| `index.ts` | Deployed entrypoint. Reads env (`SUPABASE_URL`/`SUPABASE_ANON_KEY`, auto-injected), builds a Postgres client that forwards the caller's own JWT (never the service-role key), wires it into the handler. Wrapped in `withSupabase({ auth: ["publishable"] })`. |
| `handler.ts` | The logic, framework-agnostic: validate request → `ensure_profile` + read `v_topic_stats` → run the engine → map the result to JSON. Dependencies (DB fetch, clock) are injected rather than imported directly. |
| `deno.json` | Import map for the two non-inline packages (`@supabase/functions-js`, `@supabase/server`). |
| `.npmrc` | CLI-generated registry config for npm-specifier resolution. |

## `functions/_shared/` — our own convention, not a Supabase feature

Supabase's documented pattern for code shared between functions.

- **`engine/`** — the *compiled* output of `engine/review-planner/` (real `.js`, built by `npm run build`, copied by `scripts/sync-engine.ts`). Untouched algorithm, same 202 tests, now running in Deno instead of Node.
- **`gateway/`** — hand-written `.ts`: `wire-types.ts` (JSON shapes), `mappers.ts` (DB rows ↔ engine types ↔ response JSON), `validate.ts` (hand-rolled request checking — Ajv skipped since its codegen approach is unverified under this runtime), `problem.ts` (RFC 9457 error bodies), `engine-meta.ts` (version string, the 1500ms timeout constant).
- **`README.md`** — note that this directory is generated/vendored, don't hand-edit the `engine/` part.

## Supabase features used

| Feature | Where |
|---|---|
| Postgres | Every table in `migrations/` |
| Row Level Security | Every `enable row level security` + `create policy` statement |
| Database Functions (RPC) | `submit_attempt`, `ensure_profile`, `admin_publish_answer_key` (all `authenticated`-callable); `refresh_rollups` (`service_role` only — see `fix_catalog_view_and_tighten_grants.sql`) |
| Auth (Anonymous Sign-In) | `config.toml`'s `enable_anonymous_sign_ins`, consumed as `auth.uid()` throughout RLS/RPCs |
| PostgREST (auto-generated REST API) | How the Edge Function reads `v_topic_stats`; how RLS was tested directly via `curl .../rest/v1/...` |
| Edge Functions | `plan-gateway` |

Not used (deliberately): Storage (no file uploads in this design), Realtime (nothing live-pushes),
the service-role key via PostgREST — nothing in this repo calls `rpc/refresh_rollups` with it
today (the seed scripts connect directly to Postgres instead); the grant exists for a future
admin tool or scheduled job, not something currently exercised.

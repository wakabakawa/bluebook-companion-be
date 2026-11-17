# Bluebook Companion — Backend (Review Plan Optimizer)

The Review Plan Optimizer (FR21) — a cardinality-constrained 0/1 knapsack DP that recommends
which book topics to review within a time budget — plus a thin HTTP API in front of it so the
Android app (`bluebook-companion-fe`) can call it directly. Spec: `Blubook PBL ALGOCOM.pdf`
(one level up from this repo).

Backend is moving to Supabase (Postgres + RLS, Auth, Edge Functions) — see `supabase/`. The
standalone Fastify server in `api/` is kept, not retired: both exist side by side for now.

## Layout

- `engine/review-planner/` — the algorithm: types, priority scoring, DP solver, scalar
  reference oracle, brute-force/greedy baselines, and the `planReview` service entrypoint.
  Pure function, no I/O — untouched by anything below.
- `api/` — the standalone Fastify HTTP layer (JSON Schema 2020-12, RFC 9457 problem responses).
  Still works (`npm run dev`), independent of `supabase/`.
- `supabase/` — the Postgres schema/RLS (`migrations/`) and the `plan-gateway` Edge Function
  (`functions/plan-gateway/`, `functions/_shared/` for the vendored engine + portable gateway
  code). See "Local Supabase setup" below.
- `seed/` — populates the Postgres content tables (editions, classification, items, exam sets,
  the sample Geometry answer key) from the same layout the Android app's `SampleData.kt` hardcodes.
- `tests/` — optimality tests (DP vs. exhaustive/reference/greedy), edge-case tests, and
  `contract.test.ts` (Fastify HTTP contract via `app.inject()`, no network binding).
- `benchmarks/` — seeded synthetic data generator and a runtime/complexity benchmark script.
- `demo/` — reproduces the PDF's §1.5 worked example and §6.6 edge cases from the CLI.
- `docs/MILESTONE1_CHECKLIST.md` / `docs/MILESTONE2_CHECKLIST.md` — verification checklists
  with actual measured results.

## Run it

```
npm install
npm test
npm run demo
npm run bench
npm run dev      # starts the Fastify API on :8787 (POST /api/v1/algorithm/solve)
```

## Local Supabase setup

Requires a Docker-compatible container runtime. On an SELinux-enforcing host (Fedora/Bazzite),
bind-mounting this repo into containers needs one extra step the Supabase CLI doesn't do for you:

```
sudo chcon -Rt container_file_t supabase/functions/   # once per checkout, SELinux hosts only
export CONTAINER_HOST=unix:///run/user/$(id -u)/podman/podman.sock
export DOCKER_HOST=$CONTAINER_HOST
npx supabase start
npm run sync-engine          # vendors engine/review-planner's compiled output into
                              # supabase/functions/_shared/engine/ (npm run sync-engine:check
                              # to verify no drift, wired into CI)
npm run seed:catalog
npm run seed:answer-key
```

Without the `chcon` step, the edge runtime container gets a generic `BOOT_ERROR` with no useful
detail — check `podman logs supabase_edge_runtime_<project>` for "failed to determine entrypoint"
and `podman exec <container> ls <mounted path>` for "Permission denied" to confirm this is the
cause before assuming it's a code bug.

`npx supabase stop` / `npx supabase status` need the same two env vars exported.

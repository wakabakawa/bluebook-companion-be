# Bluebook Companion — Backend (Review Plan Optimizer)

The Review Plan Optimizer (FR21) — a cardinality-constrained 0/1 knapsack DP that recommends
which book topics to review within a time budget — plus a thin HTTP API in front of it so the
Android app (`bluebook-companion-fe`) can call it directly. Spec: `Blubook PBL ALGOCOM.pdf`
(one level up from this repo).

Eventual backend is Supabase (Postgres, Auth, Storage); that wiring (the PDF's full
`plan-gateway`/RLS pipeline) is a later milestone. Today's API is a standalone Fastify server —
no database, no auth, reachable directly from an Android emulator at `10.0.2.2`.

## Layout

- `engine/review-planner/` — the algorithm: types, priority scoring, DP solver, scalar
  reference oracle, brute-force/greedy baselines, and the `planReview` service entrypoint.
  Pure function, no I/O — untouched by the API layer below.
- `api/` — the HTTP layer: JSON Schema 2020-12 request/response contracts, snake_case↔camelCase
  mappers, RFC 9457 problem responses, and the Fastify app/route/server.
- `tests/` — optimality tests (DP vs. exhaustive/reference/greedy), edge-case tests, and
  `contract.test.ts` (HTTP contract via `app.inject()`, no network binding).
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
npm run dev      # starts the API on :8787 (POST /api/v1/algorithm/solve)
```

## Not yet built

Supabase schema/RLS, the full `plan-gateway` Edge Function pipeline, auth — see the PDF's own
backlog (§5.3) for later milestones. The current `api/` is a standalone substitute that covers
the same request/response contract without a database behind it.

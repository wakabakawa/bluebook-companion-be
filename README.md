# Bluebook Companion — Backend (Review Plan Optimizer)

PBL Milestone 1 scope only: the Review Plan Optimizer (FR21) — a cardinality-constrained
0/1 knapsack DP that recommends which book topics to review within a time budget. Spec:
`Blubook PBL ALGOCOM.pdf` (one level up from this repo).

Pure TypeScript/Node, no database or network I/O in this milestone. Eventual backend is
Supabase (Postgres, Auth, Storage); that wiring is a later milestone.

## Layout

- `engine/review-planner/` — the algorithm: types, priority scoring, DP solver, scalar
  reference oracle, brute-force/greedy baselines, and the `planReview` service entrypoint.
- `tests/` — optimality tests (DP vs. exhaustive/reference/greedy) and edge-case tests.
- `benchmarks/` — seeded synthetic data generator and a runtime/complexity benchmark script.
- `demo/` — reproduces the PDF's §1.5 worked example and §6.6 edge cases from the CLI.
- `docs/MILESTONE1_CHECKLIST.md` — verification checklist with actual measured results.

## Run it

```
npm install
npm test
npm run demo
npm run bench
```

## Not in this milestone

FastAPI/`plan-gateway` equivalent, Supabase schema/RLS, Android wiring — see the PDF's own
backlog (§5.3) for later milestones.

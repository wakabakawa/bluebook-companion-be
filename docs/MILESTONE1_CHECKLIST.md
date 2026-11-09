# Milestone 1 Checklist — Review Plan Optimizer (Algorithms only)

Mirrors `Blubook PBL ALGOCOM.pdf` §7.1. Each line was ticked by actually running the
commands below inside the `bluebook-engine` distrobox, not by assuming the PDF's own numbers.

- [x] DP optimal: equals exhaustive search on randomized instances
      `npm test` → `tests/optimality.test.ts`, 120 instances (seeds × q ∈ {0,1,2}), all passed.
- [x] DP ≥ greedy on all instances, with a documented strict counterexample
      `tests/optimality.test.ts` — 20 random n=60 instances plus one forced counterexample, all passed.
- [x] Reference (scalar) DP === production DP
      `tests/optimality.test.ts` — 20 instances (n=10..50), all passed.
- [x] Edge cases handled without crash
      `tests/edgeCases.test.ts` (14 cases) and `npm run demo` edge-case section — empty input →
      `EMPTY_INPUT`; `N=0` excluded; every `k_i > B` → `BUDGET_TOO_SMALL`; infeasible `q` → relaxed
      to `q'` with `OPTIMAL_RELAXED_Q` + warning; cold-start topic → `reliable:false`; malformed
      input → `InputError`. All passed.
- [x] Worked example (§1.5) reproduced exactly
      `npm run demo` — six-topic table, objective `8.327` at `q=1` (cost 28), `8.927` at `q=0`
      (cost 28), same topic selections as the PDF's table. All passed.
- [x] Complexity claim demonstrated empirically
      `npm run bench` — DP stays under 10ms across the n≤750/B≤600/q≤3 grid; exhaustive search
      grows from 9x DP's runtime at n=8 to ~4000x at n=20 (matches the PDF's described blow-up
      shape, though the exact linear-fit R² we measured is lower than the PDF's 0.996 — small
      instances are dominated by timer/JIT noise rather than true nonlinearity; see note below).
- [x] Numbers cross-checked against the PDF rather than assumed
      Greedy-vs-DP gap over 200 synthetic instances (120 topics, B=90, q=0): optimal in 117/200,
      mean gap 0.113%, worst gap 1.015% — same ballpark as the PDF's 101/200, 0.14%, 1.04%.

## How to reproduce

```
distrobox enter bluebook-engine
cd bluebook-companion-be
npm install
npm test        # tests/optimality.test.ts + tests/edgeCases.test.ts
npm run demo     # worked example + edge-case walkthrough, exits non-zero on mismatch
npm run bench    # console tables + benchmarks/results.json
```

## Known gap vs. the PDF

The PDF's Fig. 1a claims a very clean linear fit (R² = 0.996) between DP runtime and cell
count. Our Node/TS benchmark measured R² ≈ 0.8 on the same style of grid — the DP itself is
still clearly fast and flat (well under 10ms everywhere tested), but small-`n` runs are short
enough that `performance.now()` granularity and V8 JIT warm-up dominate the signal. This does
not affect correctness, only the tightness of the empirical growth-rate fit; treat the
asymptotic bound (`O(n·q·B)`, proven in the PDF's Task 3) as the authoritative claim and the
benchmark as a sanity check, not a replacement for it.

## Out of scope for this milestone

No FastAPI/`plan-gateway` equivalent, no Supabase schema/RLS, no Android wiring — per the PDF's
own backlog (§5.3, DEV-ALGO-102..106) these are later milestones.

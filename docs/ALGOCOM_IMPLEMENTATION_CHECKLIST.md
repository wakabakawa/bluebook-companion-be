# Algorithms and Complexity (ALGOCOM) Recommended Algorithms Implementation Checklist

## Metadata

| Metadata Field | Details |
|---|---|
| Member Name(s) | [LAST NAME, FIRST NAME] |
| | [LAST NAME, FIRST NAME] |
| | [LAST NAME, FIRST NAME] |
| Section | [SECTION HERE] |
| Title of Project | Bluebook Companion: A Budget-Constrained Review Plan Optimizer |
| Project Repository | https://github.com/wakabakawa/bluebook-companion-be |

**NOTE: Implementation status** - "Yes" means the control is reported as implemented and locally
tested within its stated scope. "Partly" means some functionality exists but implementation or
verification remains incomplete. "No" means the required functionality has not been demonstrated.

## Checklist

| Feature or Module | Recommended Algorithm and Description | Status. Description of Status | Link to Code/Implementation in Repo |
|---|---|---|---|
| Recommended Review Plan (FR21) | **Algorithm 1 - Cardinality-Constrained 0/1 Knapsack Dynamic Program with Beta-Smoothed Priorities.** Given a per-topic cost (minutes to review) and value (expected items recovered, weighted by weakness and staleness), selects the subset of book topics maximizing total value within a time budget `B`, subject to a minimum count `q` of already-strong topics staying in rotation. | **Yes.** Production algorithm - this is the one real feature deployed to students via the `plan-gateway` Supabase Edge Function. Verified optimal against exhaustive search on 120 randomized instances (0 mismatches) and against a scalar reference implementation on 10 instances. Empirically confirmed `O(n·q·B)` runtime scaling (R² ≥ 0.96 against actual DP relaxations) and `O(n·q·B)` peak memory, both measured directly (not just asymptotically) in the Revised Benchmarking Analysis notebook. | `engine/review-planner/knapsack.ts` (`solveDp`), `engine/review-planner/priorities.ts` (priority scoring), `engine/review-planner/service.ts` (`planReview`, the public entrypoint); deployed via `supabase/functions/plan-gateway/handler.ts`; tested in `tests/optimality.test.ts` |
| Recommended Review Plan (correctness oracle) | **Algorithm 2 - Scalar Reference Dynamic Program.** The same cardinality-constrained 0/1 knapsack recurrence as Algorithm 1, implemented with a full 3D table and plain nested loops (no rolling rows, no typed arrays) so it is a maximally literal, easy-to-audit transcription of the recurrence - used purely to verify the production solver's optimality, not deployed. | **Yes.** Implemented and tested; confirmed to return the identical objective and selection as the production (vectorised) solver on 10 randomized instances. Not reachable from any API - test-only code. | `engine/review-planner/reference.ts` (`solveDpReference`); tested in `tests/optimality.test.ts` |
| Recommended Review Plan (test oracle) | **Algorithm 3 - Brute-Force Exhaustive Search.** Enumerates all `2^n` subsets of topics and selects the best one satisfying the budget and strong-topic constraints. Provably optimal but exponential in the number of topics; used only as a ground-truth oracle at small `n` (≤ ~20), never in production. | **Yes.** Implemented (vectorised with numpy in the Python benchmarking port, confirmed to cost `Θ(2^n)` time *and* `Θ(2^n)` memory rather than the naively-assumed `O(2^n·n)` time / `O(n)` space - see the Revised Benchmarking Analysis notebook's corrected complexity table). Used as the correctness ground truth for Algorithm 1's optimality tests (120/120 matches) and for the DP-vs-exhaustive runtime/memory comparison (Benchmark B: up to 427x faster and orders of magnitude less memory at n=22). | `engine/review-planner/baselines.ts` (`bruteForce`); tested in `tests/optimality.test.ts` |
| Recommended Review Plan (literature baseline) | **Algorithm 4 - Greedy by Value/Cost Density.** Sorts topics by value-per-minute and takes them in that order until the budget is exhausted. `O(n log n)`, the standard literature baseline for knapsack problems, but provably not optimal and ignores the minimum-strong-topic constraint entirely. | **Yes.** Implemented and benchmarked against the DP over 200 randomized instances: matched the DP optimum in 117/200 cases, with a mean value loss of 0.113% and a worst-case loss of 1.015%. A feasibility-violation check (added in the revised benchmarking pass) shows greedy's chosen topic set would fail a `q ≥ 1` maintenance constraint in roughly 80% of instances, since it has no mechanism to account for `q` at all. Kept only as a documented non-optimal comparison point and test oracle, never used to serve a real review plan. | `engine/review-planner/baselines.ts` (`greedyRatio`); tested in `tests/optimality.test.ts` |
| *(unused)* | **Algorithm 5** - n/a | n/a | n/a |

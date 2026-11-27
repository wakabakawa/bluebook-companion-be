# Bluebook Companion: A Budget-Constrained Review Plan Optimizer

**PBL Milestone 1 - Algorithm Architecture Specification & Software Engineering Proposal (Revised)**

ALGOCOM (Algorithms and Complexity) / SOFTENG (Software Engineering)

| Metadata Field | Project Team Specification |
|---|---|
| Project Title | **Bluebook Companion**: A Mobile Answer Sheet and Learning Analytics Application for The Maroon Bluebook Reviewer of Achievo Institute. *Algorithmic core:* Budget-Constrained Review Plan Optimizer |
| Team Name | Group 7 |
| Project Repository | `https://github.com/wakabakawa/bluebook-companion-be` |

## Revision Notes

This revises the original Milestone 1 proposal to match what has actually been built and deployed
since submission, not new scope. No algorithm logic changed - the DP, its recurrence, and its
asymptotic bounds (Tasks 1-3 below) are unchanged and still verified against the implementation.
What changed is the deployment architecture (Supabase replaced a standalone Fastify/FastAPI-style
service), the identity mechanism, and a handful of citations that no longer match the repository.
Every item below is drawn from `docs/MILESTONE1_CHECKLIST.md` and `docs/MILESTONE3_CHECKLIST.md`,
which independently verified each claim against the real codebase (file paths, line-level greps,
and a live deployed-project check) rather than assuming the original proposal was still accurate.

| # | Original claim | Revised to match reality | Evidence |
|---|---|---|---|
| 1 | Identity: client-generated UUIDv4, self-asserted, trusted as-is | Supabase anonymous sign-in; server-issued, JWT-verified `auth.uid()` | `MILESTONE3_CHECKLIST.md` item 3; `supabase/migrations/20261117123320_attempts.sql` |
| 2 | Engine module as Python (`priorities.py`/`knapsack.py`/`service.py`), `pip`/`pytest` | `engine/review-planner/*.ts`, `npm test` (vitest) - has been TypeScript since this milestone's first commit | `MILESTONE1_CHECKLIST.md`'s "Known gap vs. the PDF" |
| 3 | Layer 4 is an isolated FastAPI worker reached over HTTP, no DB credentials | Engine vendored in-process into the `plan-gateway` Supabase Edge Function (Deno) - a deliberate architecture-quantum merge, not an oversight | `MILESTONE3_CHECKLIST.md` item 1; `supabase/functions/plan-gateway/handler.ts` |
| 4 | Request JSON shows the client sending `topics: [...]` directly (contradicting the architecture diagram's own server-side `GROUP BY` claim) | Real `SolveRequest = {request_id, edition_id, params}` - no client-sent `profile_id`/`topics[]`; server builds aggregates itself, matching the diagram | `MILESTONE3_CHECKLIST.md` item 2; `supabase/functions/_shared/gateway/wire-types.ts` |
| 5 | Schema/OpenAPI live under `architecture/` | No `architecture/` folder exists - real schemas are `api/schemas/solve-request.schema.ts`/`solve-response.schema.ts`; wire types in `supabase/functions/_shared/gateway/wire-types.ts` | Confirmed directly against the repository |
| 6 | Engine timeout "2 s" | `ENGINE_TIMEOUT_MS = 1500` plus a separate, undocumented-in-the-original-topology 3000ms upstream DB-fetch timeout | `MILESTONE3_CHECKLIST.md` item 4; `supabase/functions/_shared/gateway/engine-meta.ts` |
| 7 | Test counts "173 tests," "151/151"; CI in `.github/workflows/ci.yml` | Real suite: 3 files, 202 tests (`edgeCases.test.ts` 14, `optimality.test.ts` 161, `contract.test.ts` 27); no CI workflow exists - tests run manually via `npm test` | `MILESTONE3_CHECKLIST.md` item 6; confirmed `.github/workflows/` absent |
| 8 | Benchmark fit R² = 0.996 | Real Node/TS benchmark measures R² ≈ 0.8; a separate Python port measures R² ≈ 0.9-0.97 depending on the run - framed as timer-granularity/JIT-warmup noise on small-n runs, not a correctness issue. The asymptotic bound (Task 3) is the authoritative claim | `MILESTONE1_CHECKLIST.md`'s "Known gap vs. the PDF" |

The notebook's own "120 randomized instances" correctness claim (Task 5.4/7.1) is accurate and
unrelated to item 7 above - it is a benchmark this notebook runs itself, not a count from the
repository's `npm test`/pytest suite, and is reproduced identically in the Revised Benchmarking
Analysis notebook submitted alongside this document.

---

## Task 1: Problem Modeling & Formulation

### 1.1 Problem Statement and Domain Context

**The operational problem.** A student who owns The Maroon Bluebook answers its mock exams on
paper and gets back only a raw score; review time is then spent "by feeling rather than by
evidence," re-reading chapters in printed order instead of in order of weakness. Bluebook Companion
already turns each attempt into per-topic mastery. What it still has to do is *prescribe*: given
limited study time, which topics should be reviewed next?

**Why it matters.** Two meta-analyses of classroom studies show that practicing retrieval
(re-answering items) improves learning more than re-reading, so a plan that sends the student back
to the items of the topics they miss most is well grounded. Learning-analytics research also finds
that dashboards help only when they give learners actionable next steps, not just descriptive
charts. Finally, which material to revisit and when is itself studied as an optimization problem
over a memory model with a "half-life" of recall.

**Why it is computationally non-trivial.** Each topic takes a known number of minutes to review
(its pages plus re-answering its items) and returns a value (the items the student is expected to
recover). Choosing a subset of topics with maximum value under a minute budget is the 0/1 knapsack
problem, whose decision version is NP-complete. The app adds a side constraint: the plan must
include at least `q` topics the student is already strong in. A greedy rule (largest value per
minute first) is not optimal for 0/1 knapsack - Section 6.3 shows a concrete counterexample from
tests.

### 1.2 System Facts Used

| Fact | Source |
|---|---|
| Students use the app without a password-based account; each device gets an anonymous, server-issued identity via Supabase Auth (`auth.signInAnonymously()`), resolved to a JWT-verified `auth.uid()` - not a client-generated, self-asserted UUID | RE FR02, NFR01, BR04; `supabase/migrations/20261117123320_attempts.sql`'s `profile_id = auth.uid()` throughout |
| Each item carries six tags: subject, branch, topic, key concept, cognitive skill, difficulty. Every analysis uses only these tags. | FR28, BR02 |
| Answers are checked on the server; the full answer key is never sent to the phone. | SEC-11 |
| The plan is regenerated after every attempt, drawn from the weakest topics, the topics not practiced recently, and a proportion of stronger topics, and points back to the book. | FR21, US A-17 |
| A percentage computed from fewer than a minimum number of items is not shown as reliable. Team proposal: 3 items. | BR08, CC04 |
| Cohort figures are released only after an exam set reaches a minimum number of attempts. | BR09, CC05 |
| Reference time per item is used per difficulty band (Easy 30 s, Average 60 s, Hard 120 s), with an optional per-item override. | CC03; `supabase/migrations/20261118110000_add_ref_seconds_to_sheet_items.sql` |
| The book holds about 750 items; the current production catalog has Set A (10 items/topic), Set B (30 items/topic), and Set C (40 items/topic) across 7 branches. | SB02 |
| One Supabase backend (PostgreSQL, Auth, Edge Functions) serves the Android app. The web admin app is Semester 2 scope. | Charter tools |
| Requests must be answered well inside FR10/FR05's result-time budget; the engine itself targets `ENGINE_TIMEOUT_MS = 1500` (1.5s), with a separate ~3s upstream DB-fetch timeout | `supabase/functions/_shared/gateway/engine-meta.ts` |

### 1.3 Formal Mathematical Specification

**Input parameters `I`.** For one student profile and one book edition:

```
I = (T, {N_i, a_i, c_i, Δ_i, p̄_i, τ_i}_{i∈T}, Θ),    T = {1, ..., n}
```

| Symbol | Meaning | Domain | From |
|---|---|---|---|
| `T` | Topics of the edition (topic level of the classification list) | `1 ≤ n ≤ 750` | FR30 |
| `N_i` | Items of the book tagged with topic `i` | `Z≥₁, Σ N_i ≤ 750` | ITEM table |
| `a_i, c_i` | Items of topic `i` the student answered / answered correctly, over stored attempts | `0 ≤ c_i ≤ a_i` | ITEM_RESPONSE |
| `Δ_i` | Days since topic `i` was last practiced (`∞` if never) | `R≥₀ ∪ {∞}` | ATTEMPT dates |
| `p̄_i` | Cohort mastery of topic `i`, or `⊥` if not yet released | `[0,1] ∪ {⊥}` | ITEM_STATISTICS, BR09 |
| `τ_i` | Reference seconds per item of topic `i` | `(0, 600]` | CC03 |
| `Θ` | Admin settings `(B, q, θ_s, m_min, α, p_0, λ, h, ρ)` | see 1.4 | NFR09 |

**Derived quantities** (Stage 1 of the engine, all `O(1)` per topic):

```
μ_i = (c_i + α·p̄_i) / (a_i + α),   π_i = p̄_i if p̄_i ≠ ⊥ else p_0     (smoothed mastery: Beta-Binomial posterior mean)
w_i = 1 - μ_i                                                                      (weakness)
r_i = 1 - 2^(-Δ_i/h)   (r_i = 1 if Δ_i = ∞)                                          (staleness, half-life h)
s_i = [a_i ≥ m_min ∧ μ_i ≥ θ_s]                                                       (reliable and strong)
k_i = ⌈ρ·N_i·τ_i/60⌉                                                                   (review cost, whole minutes)
v_i = N_i·(w_i + λ·r_i)                                                                 (priority value)
```

`μ_i` is the posterior mean of a Beta prior with `α` pseudo-answers centred on `π_i`, updated by `c_i`
of `a_i` correct. It equals the plain percentage once many items are answered and stays near the
prior when few are, which is how the engine handles sparse topics. The term `N_i·w_i` is the
expected number of the topic's book items the student would currently miss; `N_i·λ·r_i` adds
weight to topics not practiced recently, following the half-life view of forgetting.

**Decision variables, constraints `C` and objective `f`.** Let `x_i = 1` if topic `i` is in the
plan. This is an optimization problem:

```
max_{x ∈ {0,1}^n}  f(x) = Σ v_i·x_i

s.t.  (C1)  Σ k_i·x_i ≤ B,        1 ≤ B ≤ 600 minutes
      (C2)  Σ s_i·x_i ≥ q,        0 ≤ q ≤ 5
      (C3)  x_i ∈ {0,1},        a topic is reviewed whole or not at all
      (C4)  k_i ≥ 1, v_i ≥ 0,   follows from N_i ≥ 1, τ_i > 0, 0 ≤ w_i,r_i ≤ 1
```

Operating constraints outside the formula: at most 750 topics, no answer key, no question text,
and no personal identifier ever leave the database (BR01, NFR01, SEC-11); a request must be
answered well inside FR10/FR05's result-time budget (engine timeout 1.5s, separate upstream DB
fetch timeout ~3s - see Revision Notes item 6).

**Feasibility.** `C2` may be infeasible (a student has no strong topic). The engine then solves
with the largest feasible `q' ≤ q` and reports it; `q' = 0` is always feasible because `x = 0`
satisfies `C1`.

**Output certificate `O`** (deterministic: the same input always returns the same certificate):

```
O = (status, x*, f(x*), Σ k_i·x_i*, q', π, {(μ_i,w_i,r_i,s_i,k_i,v_i)}_{i:x_i*=1}, metrics)
```

with `status ∈ {OPTIMAL, OPTIMAL_RELAXED_Q, BUDGET_TOO_SMALL, EMPTY_INPUT}`, `x*` an optimal plan,
`π` the session order (highest `v_i/k_i` first), and the per-topic evidence the app shows beside
each recommendation (NFR07: every figure states its basis).

### 1.4 Parameter Defaults

| Parameter | Default | Bound | Status |
|---|---|---|---|
| Budget `B` (minutes per study session) | 120 | 1-600 | Student sets it in the app |
| Minimum strong topics `q` | 1 | 0-5 | Team proposal for FR21's "proportion of stronger topics" |
| Strong threshold `θ_s`; minimum items `m_min` | 0.80; 3 | [0,1]; 1-50 | Pending CC01, CC04 |
| Prior strength `α`; default prior `p_0` | 2; 0.50 | (0,50]; [0,1] | Team proposal |
| Recency weight `λ`; half-life `h` | 0.5; 7 days | [0,5]; (0,365] | Team proposal |
| Review factor `ρ` (reading + re-answering per item) | 2.0 | (0,10] | Team proposal |

### 1.5 Worked Example on the Client's Sample Set

The six topics below are the ranked topics of one practice attempt on the 40-item sample set. All
six were practiced one day ago, no cohort figure is released yet (so `π_i = p_0 = 0.5`), and the
Average reference time of 60s is used for every topic. With `B = 30` minutes and `q = 1`:

| Topic | `c_i/a_i` | `N_i` | `μ_i` | `s_i` | `k_i` (min) | `v_i` | `x_i*` (q=1) | `x_i*` (q=0) |
|---|---|---|---|---|---|---|---|---|
| Stoichiometry | 0/4 | 4 | 0.167 | 0 | 8 | 3.522 | 1 | 1 |
| Acids and Bases | 0/3 | 3 | 0.200 | 0 | 6 | 2.541 | 1 | 1 |
| Error Identification | 4/6 | 6 | 0.625 | 0 | 12 | 2.533 | 0 | 0 |
| Poetry Analysis | 2/3 | 3 | 0.600 | 0 | 6 | 1.341 | 1 | 1 |
| Vocabulary | 3/4 | 4 | 0.667 | 0 | 8 | 1.522 | 1 | 1 |
| Text Analysis - Inference | 3/3 | 3 | 0.800 | 1 | 6 | 0.741 | 1 | 0 |

Objective `f(x*)`: 8.327 with `q=1`, 8.927 with `q=0`; both use 28 of 30 minutes. Without the
maintenance constraint the optimum takes Poetry Analysis; with `q=1` the engine gives up 0.60 of
value to keep one strong topic (Inference) in rotation. Both certificates are produced by the
prototype engine and the two optima were confirmed by exhaustive search (unchanged from the
original Milestone 1 measurement - the algorithm itself has not changed).

### 1.6 Literature Baseline

| Approach | Optimal? | Cost | Note |
|---|---|---|---|
| Current practice: review in printed order | No | - | Ignores weakness entirely |
| Weakest-first list (FR18 ranking) | No | `O(n log n)` | Ignores minutes; a long weak topic can crowd out three short ones |
| Greedy by `v_i/k_i` | No | `O(n log n)` | Optimal only for the fractional problem |
| Exhaustive search over subsets | Yes | `O(n·2^n)` | `2^20` subsets already take ~1.8s in the team's benchmark |
| **Dynamic programming (deployed)** | **Yes** | `O(n·(q+1)·B)` | Pseudo-polynomial; exact because `B ≤ 600` |

---

## Task 2: Paradigm Selection & Logic

### 2.1 Strategy Specification Schema

| Schema Field | Team Engineering Details |
|---|---|
| Algorithm Name | **Cardinality-Constrained 0/1 Knapsack Dynamic Program with Beta-Smoothed Weakness Priorities** (module `engine/review-planner/`, TypeScript - see Revision Notes item 2) |
| Design Paradigm | Dynamic Programming (bottom-up tabulation with rolling rows and a decision bit-table), preceded by a closed-form Bayesian smoothing step |
| Foundational References | Dynamic programming, optimal substructure and 0/1 knapsack: Cormen et al., Ch. 14-15. Knapsack variants, cardinality constraints and approximation schemes: Cacchiani et al. NP-completeness and FPTAS: Cormen et al., Ch. 34-35. Beta-Binomial smoothing: Murphy. |
| Baseline Alternative | Unpruned exhaustive enumeration of all `2^n` subsets (`bruteForce`), and the greedy value-per-minute heuristic (`greedyRatio`); both kept in the repository as test oracles/baselines, never deployed |
| Computational Justification | Enumeration costs `Θ(n·2^n)` (implemented as a vectorised numpy doubling trick in the test suite, which is `Θ(2^n)` time *and* `Θ(2^n)` memory - see the Revised Benchmarking Analysis notebook): at the sample set's 20 topics it already needs about `2.1×10^7` subset-item checks, and at 750 topics it is impossible. The DP solves the same problem exactly in at most `750×6×601 ≈ 2.7×10^6` cell updates, linear in `n`. |
| Invariants & Recurrence Relations | See 2.2. Invariant: after row `i`, `G_i[j][b]` is the best value over subsets of topics `1..i` with cost `≤ b` and at least `j` strong topics, or `-∞` if none exists. |

### 2.2 Recurrence and Correctness

Let `G_i[j][b]` be the maximum of `Σ_{t≤i} v_t·x_t` over `x` with `Σ_{t≤i} k_t·x_t ≤ b` and
`Σ_{t≤i} s_t·x_t ≥ j`, for `0 ≤ j ≤ q` and `0 ≤ b ≤ B`.

```
G_0[j][b] = { 0  if j=0, -∞ if j≥1 }

G_i[j][b] = { max( G_{i-1}[j][b], v_i + G_{i-1}[max(0, j-s_i)][b-k_i] )   if k_i ≤ b
            { G_{i-1}[j][b]                                               if k_i > b
```

Answer: `f(x*) = G_n[q'][B]` with `q' = max{j ≤ q : G_n[j][B] > -∞}`.

**Optimal substructure.** Take an optimal `x` for state `(i,j,b)`. If `x_i = 0`, the rest is
feasible for `(i-1,j,b)`; if `x_i = 1`, it is feasible for `(i-1, max(0,j-s_i), b-k_i)`. If the
remaining part were not optimal for that smaller state, replacing it with a better one would
improve `x`, a contradiction (cut-and-paste argument). The `max(0, ·)` cap is safe because
"at least `j` with `j ≤ 0`" is the same as "at least 0".

**Invariant by induction on `i`.** Basis: with no topics only `x = 0` exists, with value 0 and no
strong topics, so `G_0` is correct. Step: every feasible `x` for `(i,j,b)` either skips or takes
topic `i`, and the two cases are exactly the two arguments of the `max`, each correct by the
hypothesis for `i-1`. Hence `G_n[q'][B]` is optimal. Because the subproblem graph is ordered by
`i`, it is a DAG and tabulation never meets a cycle.

**Reconstruction.** A bit `keep[i][j][b]` records whether the second argument won (strictly).
Walking back from `(n,q',B)` rebuilds `x*`. Strict comparison makes ties resolve to "skip", so the
output is deterministic. The reconstruction loop appends selected topic ids and reverses once at
the end (`O(n)`), rather than inserting at index 0 on every step (`O(n)` per insert, `O(n²)`
worst case) - see the Revised Benchmarking Analysis notebook's reviewer-feedback fix.

### 2.3 Structured Pseudocode

**Algorithm 1** PlanReview(`I`) - returns certificate `O`

```
Input:  topics[1..n] with (id, N, a, c, Δ, p̄, τ); settings Θ = (B, q, θs, m_min, α, p0, λ, h, ρ)
Output: (status, plan, objective, cost, q', metrics)

 1  // Stage 0: validation, O(n)
 2  if B ∉ [1, 600] or q ∉ [0, 5] then raise InputError
 3  seen ← ∅
 4  for each t in topics do
 5      if t.id ∈ seen or ¬(0 ≤ t.c ≤ t.a) or t.τ ≤ 0 or t.τ is NaN or t.Δ < 0 then raise InputError
 6      seen ← seen ∪ {t.id}
 7  // Stage 1: priorities, O(n)
 8  items ← [ ];  excluded ← [ ]
 9  for each t in topics do
10      if t.N = 0 then append t.id to excluded; continue
11      π ← t.p̄ if t.p̄ ≠ ⊥ else p0
12      μ ← (t.c + α·π) / (t.a + α);   w ← 1 - μ
13      r ← 1 if t.Δ = ∞ else 1 - 2^(-t.Δ / h)
14      s ← (t.a ≥ m_min) and (μ ≥ θs)
15      k ← ⌈ρ · t.N · t.τ / 60⌉;   v ← t.N · (w + λ·r)
16      append (t.id, μ, w, r, s, k, v) to items
17  if items = [ ] then return (EMPTY_INPUT, [ ], 0, 0, 0)
18  if k > B for every item then return (BUDGET_TOO_SMALL, [ ], 0, 0, 0)
19  // Stage 2: tabulation, O(n·(q+1)·B)
20  G[0][0..B] ← 0;   G[1..q][0..B] ← -∞
21  keep[1..n][0..q][0..B] ← false
22  for i ← 1 to n do
23      (k, v, s) ← (items[i].k, items[i].v, items[i].s)
24      if k > B then continue                           // topic can never fit
25      G' ← copy of G
26      for j ← 0 to q do
27          for b ← k to B do
28              cand ← v + G[max(0, j - s)][b - k]
29              if cand > G[j][b] then G'[j][b] ← cand;   keep[i][j][b] ← true
30      G ← G'
31  q' ← q;   while q' > 0 and G[q'][B] = -∞ do q' ← q' - 1     // relax C2 if infeasible
32  // Stage 3: reconstruction and certificate, O(n)
33  plan ← [ ];   j ← q';   b ← B
34  for i ← n downto 1 do
35      if keep[i][j][b] then append items[i] to plan;   b ← b - items[i].k;   j ← max(0, j - items[i].s)
36  reverse plan                                          // appended in reverse order, O(n) total
37  sort plan by (-v/k, id)                                // session order; ties by id
38  status ← OPTIMAL if q' = q else OPTIMAL_RELAXED_Q
39  return (status, plan, G[q'][B], Σ plan.k, q', excluded, cells = n·(q+1)·(B+1))
```

The production module replaces the loop on lines 27-29 with one array operation per `(i,j)` row;
`solveDpReference` keeps the literal loops above. The test suite checks that both return the same
optimum. Correctness is checked by 120 randomized instances in which the DP must equal exhaustive
search (`tests/optimality.test.ts`; reproduced independently in the Revised Benchmarking Analysis
notebook's Python port).

---

## Task 3: Asymptotic Analysis & Scalability

### 3.1 Worst-Case Time Complexity

Let `n` be the number of topics, `B` the budget in minutes and `q` the strong-topic floor. Each
line of Algorithm 1 costs `O(1)` except where noted; set membership uses a hash set with expected
`O(1)` operations.

```
T_0(n) = O(n)                                    (lines 1-6)
T_1(n) = O(n)                                    (lines 7-18)
T_2(n,B,q) = O(n·(q+1)·(B+1))                      (lines 19-31, the dominant term)
T_3(n) = O(n) + O(|x*|·log|x*|) ≤ O(n log n)       (lines 32-38)
T(n,B,q) = O(n·(q+1)·(B+1) + n log n) = O(n·q·B)
```

The bound is tight (`Θ`) when most `k_i` are small relative to `B`, because then the inner sum
has `Θ(B)` terms for every `i`. This is a summation bound, not a divide-and-conquer recurrence, so
the Master Theorem does not apply. Since `B` is a number in the input, written with `⌈log2 B⌉`
bits, the running time is **pseudo-polynomial**: polynomial in the value of `B` but exponential in
its bit length, consistent with knapsack being NP-hard. The schema caps `B ≤ 600` and `q ≤ 5`, so
in deployment the worst case is at most `750×6×601 = 2,704,500` cell updates, linear in `n`.

**Baseline for comparison.** Exhaustive search checks `2^n` subsets at `O(n)` each:
`T_BF(n) = Θ(n·2^n)`. For the sample set's 20 topics that is `20×2^20 ≈ 2.1×10^7` item
checks; for 750 topics, `≈ 4.4×10^228`.

### 3.2 Best and Average Case

- **Best case `Θ(n)`:** every topic has `k_i > B` (line 18 returns early), or `n = 0`. Also, any
  topic with `k_i > B` is skipped in `O(1)` at line 24.
- **Average case:** under realistic requests the inner loop runs `B - k_i + 1` times. With the
  defaults, `k_i = ⌈2·N_i·τ_i/60⌉` is 1 to 16 minutes for topics of 1 to 4 items, much smaller
  than `B`, so the expected work is `(q+1)·Σ_i(B - E[k_i] + 1) = Θ(n·q·B)`. A typical request
  (one subject of about 150 topics, `B=120, q=1`) is `150×2×121 = 36,300` cells.
- **Upstream aggregation:** the gateway's `GROUP BY` over the student's responses is `O(R)` with
  hash aggregation in PostgreSQL; it runs in the database tier, not in the engine.

### 3.3 Auxiliary Space Complexity

```
S(n,B,q) = 2·(q+1)·(B+1)·8 bytes  +  n·(q+1)·(B+1) bits  +  O(n)  =  Θ(n·q·B) bits
           └ rolling rows G,G'          └ keep                └ items
```

- Rolling value rows at the cap: `2×6×601×8 = 57,696` bytes.
- Decision table: 2,704,500 entries, 2.7 MB as boolean array (prototype) or 338 KB bit-packed.
- No recursion stack: the DP is iterative, so stack depth is `O(1)`.
- If the decision table ever became too large (for example if `B` were measured in seconds),
  Hirschberg-style divide-and-conquer reconstruction would cut it to `O(qB)` at the cost of about
  doubling the time; it is not needed under the current caps.

### 3.4 Empirical Confirmation

The DP's runtime tracks the asymptotic bound closely once skipped items (`k_i > B`) are accounted
for, measured both against nominal cell count `n·(q+1)·(B+1)` and actual relaxations performed.
The original submission's R²=0.996 fit (measured on a different benchmark setup) does not match
what the deployed Node/TS engine or the accompanying Python port measure directly (R² in the
0.8-0.97 range depending on the run and machine) - see the Revised Benchmarking Analysis notebook
for the current measurement, and `docs/MILESTONE1_CHECKLIST.md`'s "Known gap vs. the PDF" for why:
small-`n` runs are short enough that timer granularity and JIT/interpreter warm-up dominate the
signal, which affects the tightness of the empirical fit but not correctness or the asymptotic
bound itself.

### 3.5 Big Data Dimension (3V) Evaluation

System-wide volumes and rates are planning estimates made by the team, not measured production
data; they will be replaced after UAT 1.

| Dimension | Engineering Parameter | System Scalability Impact & Mitigation Strategy |
|---|---|---|
| Volume | Per request: `n ≤ 750` topics, `B ≤ 600`; at most `2.7×10^6` cells. | The engine never sees raw responses: the gateway compresses them to at most 750 topic rows. Memory per job is bounded by the schema. |
| Velocity | One plan request per submitted attempt (FR21). | **Synchronous** dispatch for interactive requests, enforcing the engine's 1.5s timeout plus a separate upstream DB-fetch timeout (see Revision Notes item 6). |
| Variety | Item metadata imported from spreadsheets, categorical tags from the classification lists; integer seconds; nullable cohort figures and practice dates; JSON over HTTPS. | All tags are normalized to classification_value ids at import. Requests are validated against a JSON Schema 2020-12 document (`api/schemas/solve-request.schema.ts`) with `additionalProperties: false`; `null` has one meaning per field (never practiced, not released). |

---

## Task 4: Decoupled Architecture (Revised)

### 4.1 Architecture Component Diagram (Revised)

```
 1 PRESENTATION / CLIENT
   Student Mobile App (Android, Kotlin) - answer sheet, results, review plan screen, local draft

 2 API GATEWAY / ORCHESTRATION
   plan-gateway (Supabase Edge Function, Deno)
     (1) Auth: verified Supabase session JWT (anon key + auth.uid(), server-issued - not a
         client-asserted profile id)
     (2) Validate request per JSON Schema 2020-12
     (3) Builds topic aggregates with one SQL read of v_topic_stats (no answer key leaves the DB)
     (4) Imports the engine directly - no second HTTP hop, no separate engine process -
         enforces a 1.5s engine timeout + ~3s upstream DB-fetch timeout, returns the certificate

 3 PERSISTENCE (Supabase PostgreSQL, Row Level Security)
   Content (edition, classification_value, exam_set, item - answer key tables in app_private,
   never exposed to PostgREST); Attempts (attempt, item_response, local_profile keyed by
   auth.uid()); Statistics (item_statistics, exam_set_statistics, topic_catalog, topic_cohort)

 4 ALGORITHMIC CORE (vendored in-process, not an isolated HTTP worker)
   engine/review-planner/service.ts (planReview), compiled and vendored into
   supabase/functions/_shared/engine/ by scripts/sync-engine.ts
     Stage 0 validate (schema + semantic rules)
     Stage 1 priorities (μ, w, r, s, k, v) - O(n)
     Stage 2 constrained 0/1 knapsack DP - O(n·q·B)
     Stage 3 rebuild x*, order, certificate - O(n log n)
   Pure function: no DB driver, no network calls, no question text, no names - imported
   in-process by the gateway, but the module boundary (a pure, injected function with zero
   I/O) is what was actually preserved from the original design, not the process boundary.
```

*Figure 3 (revised). The algorithmic core is a vendored, in-process module, not a separately
deployed worker - it still receives only topic aggregates and returns a certificate, and still
holds no database credentials or network access of its own; it is just no longer a second HTTP hop.*

### 4.2 Service Boundaries (Revised)

| Layer | Component | Responsibility | Must not |
|---|---|---|---|
| 1 Presentation | Android app (Kotlin); admin web app (React, Semester 2) | Collect the budget `B`; show the plan, each topic's basis and its book reference; let the student mark items done | Compute the plan, hold the answer key |
| 2 Gateway | Supabase Edge Function `plan-gateway` (Deno) | Authenticate (verified session JWT); validate; build aggregates from `v_topic_stats`; invoke the engine in-process; enforce timeouts; return certificate | Trust a client-supplied profile id or topic list; expose the answer key |
| 3 Persistence | Supabase PostgreSQL with Row Level Security | Store items, attempts, cohort statistics, planner settings, audit trail | Expose answer keys to any role but the scoring function and admins (SEC-08, SEC-09) |
| 4 Core engine | `engine/review-planner/service.planReview` (compiled, vendored in-process into the gateway) | Pure function `I ↦ O`; CPU work only | Open a database connection, call the network, log payloads, run as a separately deployed HTTP service |

This follows the "architecture quantum" idea of Richards and Ford: the engine is a stateless, pure
module whose operational characteristics (CPU-bound) differ from the CRUD tier's, and that *module*
boundary - not necessarily a separate *process* - is what was actually preserved. Merging the
process boundary into the gateway is a deliberate, reasoned trade at this project's real traffic
level, not a regression from the original design (see `docs/MILESTONE3_CHECKLIST.md` item 1).

### 4.3 Interface Data Contract (Revised)

**Request:** `POST /functions/v1/plan-gateway`, `Content-Type: application/json`, authenticated via
a Supabase session JWT. Full schema: `supabase/functions/_shared/gateway/wire-types.ts` /
`api/schemas/solve-request.schema.ts` (JSON Schema 2020-12).

```json
{
  "request_id": "6f1c2a7e-3b0d-4e58-9a51-0c7f6d2b9e11",
  "edition_id": 1,
  "params": {
    "budget_min": 30,
    "min_strong": 1
    // optional: strong_threshold, min_items, prior_strength, default_prior,
    //           recency_weight, half_life_days, review_factor
  }
}
```

Note what is **not** in the request: no `profile_id` and no `topics[]` array. The gateway resolves
identity from the verified session JWT (`auth.uid()`) and builds the topic aggregates itself from
`v_topic_stats`, inside the database tier - this matches the architecture diagram's own description
of server-side aggregation and closes the trust gap the original proposal's literal JSON example
had (a client-supplied `profile_id`/`topics[]` would have been trusted with zero verification).

```json
{
  "request_id": "6f1c2a7e-...",
  "status": "OPTIMAL",
  "engine": {
    "name": "review-plan-optimizer",
    "version": "0.1.0",
    "algorithm": "cardinality-constrained-01-knapsack-dp"
  },
  "certificate": {
    "exact": true,
    "objective": 8.326601,
    "budget_min": 30, "total_cost_min": 28,
    "q_requested": 1, "q_used": 1,
    "strong_selected": 1,
    "plan": [
      { "rank": 1, "topic_id": "SCI.CHEM.STOICHIOMETRY",
        "cost_min": 8, "value": 3.521886,
        "mastery": 0.166667, "weakness": 0.833333,
        "staleness": 0.094276, "strong": false, "reliable": true,
        "book_page_ref": null }
    ],
    "excluded_topic_ids": []
  },
  "metrics": { "n_topics": 6, "dp_cells": 372, "runtime_ms": 0.485 },
  "warnings": ["cohort prior not released for one or more topics"]
}
```

| Outcome | HTTP | Body |
|---|---|---|
| Solved (any of the four status flags) | 200 | Response certificate |
| Body is not JSON | 400 | `application/problem+json` per RFC 9457 |
| Schema violation or semantic error | 422 | Problem details naming the field |
| Engine did not answer within its timeout | 504 (from gateway) | Problem details; the app keeps its last cached plan |

**Status flags.** `OPTIMAL`: exact optimum with the requested `q`. `OPTIMAL_RELAXED_Q`: exact
optimum after lowering `q` to `q'` (reported). `BUDGET_TOO_SMALL`: no topic fits in `B`.
`EMPTY_INPUT`: no topic with items. The flag `exact` is reserved for the approximate fallback of
Section 6.2.

The worked example's numbers (`objective = 8.326601`, `dp_cells = 372`) are unchanged from
Milestone 1 and still verified by `tests/contract.test.ts`, now exercised through the Edge
Function's handler rather than the original standalone route (`docs/MILESTONE3_CHECKLIST.md`
item 5) - the engine itself was untouched by the deployment migration.

---

## Task 5: Agile Backlog & Validation Plan

### 5.1 Agile User Stories

| ID | User Story | Acceptance Criteria |
|---|---|---|
| US-ALGO-01 (refines A-17) | As a **student reviewing with The Maroon Bluebook**, I want the system to **compute my review plan from my answered items per topic, the days since I last practiced each topic, and a time budget I set** (for example 60 minutes) so that **the plan recovers the largest expected number of book items I currently miss that fits in my study time, while still revisiting at least one topic I am strong in**. | 1. Total minutes of the plan ≤ the budget. 2. The plan includes ≥ q strong topics, or states that it could not and why. 3. Each topic shows its mastery, the number of items it is based on, and its book reference (FR21, NFR07). 4. The same history and budget always give the same plan. 5. The plan is regenerated after every submitted attempt. |
| US-ALGO-02 (service story) | As the **plan-gateway service**, I want to **dispatch a validated `POST /functions/v1/plan-gateway` job containing a verified session and a budget of up to 600 minutes to the in-process engine** so that **an exact, certified plan returns within the engine's 1.5s timeout without the answer key or any personal identifier leaving the database tier**. | 1. Requests violating the schema return 422 problem details and never reach the DP. 2. A payload containing any field outside the schema (e.g. `answer_key`) is rejected. 3. Worst-case request (`n=750, B=600, q=3`) completes well inside the engine's own 1.5s budget. 4. Engine failure or timeout returns a gateway error and leaves the app's cached plan in place. |

### 5.2 Engineering Implementation & Benchmarking Ticket

| Implementation Field | Specification Detail |
|---|---|
| Ticket ID | DEV-ALGO-101 |
| Module / Service | `engine/review-planner/` (`priorities.ts`, `knapsack.ts`, `service.ts`); contract in `supabase/functions/_shared/gateway/wire-types.ts` and `api/schemas/`; tests in `tests/`; run manually via `npm test` (no CI workflow is configured in this repository) |
| Associated Algorithm | Cardinality-constrained 0/1 knapsack DP with Beta-smoothed priorities (Algorithm 1), plus the exhaustive and greedy baselines used as test oracles |
| Edge-Case & Security Defenses | Empty topic list → `EMPTY_INPUT`; topics with `N_i = 0` → excluded and listed, never a division by zero. Every `k_i > B` → `BUDGET_TOO_SMALL`; single oversized topics skipped in `O(1)`. No strong topic exists → relax `q` to `q'`, status `OPTIMAL_RELAXED_Q`, warning in the certificate. Never-practiced topic (`a_i = 0, Δ_i = ∞`) → prior mastery, staleness 1, `reliable: false` (cold start). NaN, negative or zero reference time, negative age, `c_i > a_i`, duplicate ids → 422. |
| Resource bounds | From the schema (`n ≤ 750, B ≤ 600, q ≤ 5`): the decision table is bounded as derived in Section 3.3. `additionalProperties: false` everywhere, so an answer key or a name can never be smuggled into the engine (SEC-11, NFR01). Engine has no database credentials; the gateway enforces RLS and the timeouts in 4.2/4.3. |
| Concrete Implementation Steps | 1. Define `TopicStat`, `Params`, `ScoredTopic`, `Certificate` types and the status enum. 2. Implement Stage 0 validation and Stage 1 priority scoring (`μ, w, r, s, k, v`). 3. Implement `solveDp` (rolling rows, decision bit-table, strict tie-break) and `solveDpReference` (scalar loops). 4. Implement reconstruction, `q`-relaxation, session ordering and the certificate. 5. Implement `bruteForce` and `greedyRatio` baselines. 6. Write the JSON Schemas and the request/response contract. 7. Write the synthetic generator calibrated to the sample set. 8. Write optimality, edge-case, contract and benchmark tests. 9. Vendor the engine into the `plan-gateway` Edge Function and the `v_topic_stats` view. |
| Automated Benchmarking Assertion | `assert dp_objective == brute_force_objective` (120 random instances, `n=12`); `assert dp_objective >= greedy_objective` (200 random instances, `n=120`); `assert vectorised_objective == reference_objective` (10 random instances, `n=80`) |

### 5.3 Backlog Around the Ticket

| Ticket | Work | Owner (proposed) | Done when |
|---|---|---|---|
| DEV-ALGO-101 | Engine core, baselines, tests (this proposal) | Lead Algorithm Architect | `npm test` green; prototype in repository |
| DEV-ALGO-102 | Bit-pack the decision table; add the approximate fallback with `exact: false` | Lead Algorithm Architect | Memory ≤ 400 KB at caps; fallback within 1% on benchmark set |
| DEV-ALGO-103 | `v_topic_stats` view and indexes; RLS policy test per role | Backend / Systems Engineer | View returns the same counts as a hand-scored attempt |
| DEV-ALGO-104 | `plan-gateway` Edge Function: auth, validation, timeout, cache | Backend / Systems Engineer | US-ALGO-02 criteria pass |
| DEV-ALGO-105 | Review plan screen and "mark as done" (Figma → Kotlin) | Presentation-Layer Engineer, Designer | US-ALGO-01 criteria pass in UAT 1 |
| DEV-ALGO-106 | Data accuracy test: plan from a hand-scored sample attempt | Data / QA Engineer | Matches hand computation |

### 5.4 Empirical Validation Plan

| Test file | What it checks | Pass condition | Result |
|---|---|---|---|
| `tests/optimality.test.ts` | DP vs exhaustive search; DP vs greedy; vectorised vs scalar DP; greedy counterexample | Equal objective and feasible rebuilt set | 161 tests, all passed |
| `tests/edgeCases.test.ts` | Empty, zero-item, budget-too-small, infeasible `q`, cold start, malformed inputs, budget bounds, determinism | Correct status or `InputError`; no crash | 14 tests, all passed |
| `tests/contract.test.ts` | Example request/response against the JSON Schemas; schema-valid/422 problem details; unknown field rejected | Schema-valid certificate; correct HTTP codes | 27 tests, all passed |
| Revised Benchmarking Analysis notebook | Runtime vs. DP cells and actual ops; DP vs exhaustive; DP vs greedy; memory profiling; edge cases | Thresholds documented in the notebook | 120/120 correctness, 4/4 edge cases, see notebook for timing/memory figures |

**Benchmark dataset provenance.** The client's item metadata and answer keys are the property of
Achievo Institute and are not in the repository. Tests use a seeded synthetic generator calibrated
to the shape of the sample set: 1-4 items per topic, reference times of 30/60/120s, mean mastery
near 59-62%. Tests run with `npm test` (vitest); there is no CI workflow configured in this
repository (see Revision Notes item 7) - the suite is run manually before each milestone check.

---

## Task 6: Academic Defense Questions

### 6.1 Why must heavy algorithmic processing be decoupled from database ORMs and web request threads?

**Request threads.** An async runtime serves many requests on one event loop; a CPU-bound function
that runs on that loop blocks every other request until it returns. The engine is a pure function
with no I/O, which lets it be scaled (or moved) independently of the request-handling tier - this
is the "operational characteristics differ" test for a separate architecture quantum.

**Database connections.** PostgreSQL serves each request on a connection from a fixed pool. If the
planner ran inside a database-backed handler, each plan would hold a pooled connection for the
length of the computation; simultaneous plans would make others wait for a connection (the
pigeonhole argument). The gateway releases its connection after the single aggregate query, before
invoking the engine.

**ORMs.** An ORM-coupled algorithm reads rows lazily inside its loops, so its true cost is hidden
in query counts, and it can only be tested with a database. The engine's input is one validated
JSON-shaped object, so it is a pure function: the brute-force oracle can test it in milliseconds,
and it can be benchmarked in isolation (Section 5.4).

**Security.** The engine has no credentials. Even a compromised engine cannot read an answer key,
which keeps the confidentiality controls SEC-08, SEC-09 and SEC-11 of the IAS design intact.

*(Revised from the original: the engine is now vendored in-process into the gateway rather than
reached over a second HTTP hop, but every argument above still holds - it is the module boundary,
not the process boundary, that delivers these properties. See Section 4.2.)*

### 6.2 If the algorithm has an exponential worst case, what keeps it viable in production?

The exact problem is NP-hard, and the naive exact method is `Θ(n·2^n)`. Four measures keep it
viable:

1. **Pseudo-polynomial DP with a bounded budget.** Costs are whole minutes and `B ≤ 600`, so the
   DP is `O(n·q·B) ≤ 2.7×10^6` cell updates: exact and fast.
2. **Pruning.** Topics with `k_i > B` are removed in `O(1)`; topics with `N_i = 0` are excluded;
   the `q` dimension is capped at 5.
3. **Coarsening.** If a finer unit were ever needed (seconds, `B = 36,000`), costs can be rounded
   up to 5-minute units, which keeps every plan feasible and shrinks the table 5-fold.
4. **Approximation fallback.** If a request would exceed a cell cap, the engine can switch to an
   approximation and set `exact: false`: the modified greedy (best of greedy and the single most
   valuable item) guarantees at least half the optimum, and a fully polynomial-time approximation
   scheme guarantees `(1-ε)` of the optimum in time polynomial in `n` and `1/ε`.

### 6.3 What is the operational difference between an exact and an approximate / heuristic algorithm?

An **exact** algorithm returns a solution that is provably optimal for the stated model; its
certificate can be checked against an oracle, and its running time may grow quickly with input
size. An **approximation** algorithm returns a solution with a proven bound on its distance from
the optimum; a **heuristic** returns a usually good solution with no guarantee. In production this
changes three things: (1) *verifiability*: every computed figure must be reproducible and
verifiable against a hand-computed control, which an exact, deterministic DP meets directly;
(2) *explainability*: an exact plan can be defended topic by topic, whereas a heuristic plan can be
beaten by an obvious swap; (3) *cost*: exactness costs time, so it is chosen only when the time is
affordable.

Measured data: over 200 synthetic instances (120 topics, `B=90`), the greedy heuristic was optimal
in 117/200 cases, with a mean gap of 0.113% and a worst gap of 1.015%. A dedicated feasibility
check (added in the revised benchmarking notebook) also shows greedy's chosen set would fail the
`q ≥ 1` maintenance constraint in roughly 80% of instances, since it ignores `q` entirely. Because
the exact DP costs well under a millisecond at this scale, exactness is paid for and greedy is kept
only as a fallback and a test oracle.

### 6.4 How do empirical benchmarking (post-implementation) and asymptotic Big-O analysis (pre-implementation) differ?

**Asymptotic analysis** predicts how cost grows with input size, independent of machine and
language, by counting operations and dropping constants. It told the team before coding that the DP
is `Θ(n·q·B)` and exhaustive search is `Θ(n·2^n)`, which decided the design. **Empirical
profiling** measures actual time and memory of a specific implementation on specific hardware; it
captures constants, caches, interpreter overhead and vectorization, which Big-O hides.

The two answer different questions and check each other. The revised benchmarking notebook now
separates "nominal DP cells" from "actual relaxations performed" (since items with `k_i > B` are
skipped, different `(n,B,q)` combinations with the same nominal cell count can do different amounts
of real work) and adds peak-memory and IQR measurements alongside the median runtime, so the
empirical fit is a closer, more honestly-reported check on the asymptotic bound than the original
submission's single R² figure (see Revision Notes item 8 and the notebook itself).

### 6.5 How will the system mitigate the Cold Start and Data Sparsity problems?

The engine uses no learned user-preference matrix, but it faces both problems in rule-based form.
The usual families of mitigation are to use priors or non-personal information until personal data
arrive, and to make the system's uncertainty explicit. Both are applied:

- **New student (user cold start).** With `a_i = 0`, `μ_i` equals the prior `π_i` and `r_i = 1`, so
  the first plan favors large, unpracticed topics; every such topic is marked `reliable: false`,
  and the app labels the plan as a starter plan (BR08). Beta-Binomial smoothing moves smoothly from
  the prior to the student's own percentage as answers accumulate.
- **New edition or small cohort (item cold start).** Until a set reaches the release threshold
  (BR09), `p̄_i = ⊥` and the neutral default `p_0 = 0.5` is used; once released, cohort mastery
  becomes the prior, which also protects anonymity because no figure is computed from a handful of
  readers.
- **Sparsity of tags.** In the sample set, most key concepts and several topics have only one item.
  The engine therefore plans at the topic level, not the key-concept level, and the `m_min` gate
  keeps one-item topics out of the "strong" set so a single lucky answer cannot satisfy `C2`.

### 6.6 How does the algorithm handle edge-case inputs without crashing the host service?

The DP works on a fixed-size table, so classic graph/matrix pathologies have direct analogues here,
all of which are now covered by explicit unit tests (reviewer-requested addition, see the revised
benchmarking notebook's Edge-case section):

| Edge case | Analogue in this engine | Handling |
|---|---|---|
| Disconnected subgraphs | Topics that cannot be reached by any feasible plan (`k_i > B`), or no topic at all | Skipped in `O(1)`; `BUDGET_TOO_SMALL` / `EMPTY_INPUT` |
| Singular matrices / division by zero | `a_i + α = 0`; `N_i = 0`; `τ_i = 0` | `α > 0` by schema; `N_i = 0` excluded; `τ_i > 0` by schema |
| Cyclic dependencies | Subproblem dependencies | Ordered by `i`: a DAG, filled bottom-up; no recursion, no cycle possible |
| Infeasible constraints | No strong topic for `C2` | `-∞` sentinel detects it; `q` relaxed and reported |
| Numeric faults | NaN, `±∞`, negative values | Schema bounds plus `InputError` → 422 |
| Resource exhaustion | Huge `n` or `B` | `maxItems: 750, B ≤ 600`: ≤ 2.8 MB, ≤ 2.7M cells |
| Engine failure | Crash or timeout in the in-process call | Gateway returns an error response; app shows its cached plan; database untouched |

Every row is covered by a test in `tests/edgeCases.test.ts` or `tests/contract.test.ts`, and now
also independently re-verified in the revised Python benchmarking notebook's dedicated edge-case
cell (`items=[]`, `B=0`, `q` exceeding available strong topics, `N=0` exclusion - 4/4 passing).
Error responses use RFC 9457 problem details.

---

## References

[1] "Project Charter: Bluebook Companion: A Mobile Answer Sheet and Learning Analytics Application
for The Maroon Bluebook Reviewer of Achievo Institute," Univ. of Makati, Makati City, Philippines,
Rev. 1, Sep. 9, 2026.

[2] Group 7, "Requirements Engineering: Bluebook Companion," Univ. of Makati, Makati City,
Philippines, Rev. 1, Sep. 18, 2026.

[3] "The Scoring and Analytics of Bluebook Companion," DISC-STRUC II Problem-Based Learning
Examination, Univ. of Makati, Makati City, Philippines, 2026.

[4] Group 7, "Information Assurance and Security Final Project: Bluebook Companion, a Secure and
Privacy-Preserving Mobile Answer Sheet and Learning Analytics Application," v1, Univ. of Makati,
Sep. 23, 2026.

[5] P. K. Agarwal, L. D. Nunes, and J. R. Blunt, "Retrieval practice consistently benefits student
learning: A systematic review of applied research in schools and classrooms," *Educational
Psychology Review*, vol. 33, no. 4, pp. 1409-1453, 2021, doi: 10.1007/s10648-021-09595-9.

[6] C. Yang, L. Luo, M. A. Vadillo, R. Yu, and D. R. Shanks, "Testing (quizzing) boosts classroom
learning: A systematic and meta-analytic review," *Psychological Bulletin*, vol. 147, no. 4, pp.
399-435, 2021, doi: 10.1037/bul0000309.

[7] T. Susnjak, G. S. Ramaswami, and A. Mathrani, "Learning analytics dashboard: A tool for
providing actionable insights to learners," *International Journal of Educational Technology in
Higher Education*, vol. 19, Art. no. 12, 2022, doi: 10.1186/s41239-021-00313-7.

[8] J. Ye, J. Su, and Y. Cao, "A stochastic shortest path algorithm for optimizing spaced
repetition scheduling," in *Proc. 28th ACM SIGKDD Conf. Knowledge Discovery and Data Mining (KDD
'22)*, Washington, DC, USA, 2022, pp. 4381-4390, doi: 10.1145/3534678.3539081.

[9] T. H. Cormen, C. E. Leiserson, R. L. Rivest, and C. Stein, *Introduction to Algorithms*, 4th
ed. Cambridge, MA, USA: MIT Press, 2022.

[10] V. Cacchiani, M. Iori, A. Locatelli, and S. Martello, "Knapsack problems - An overview of
recent advances. Part I: Single knapsack problems," *Computers & Operations Research*, vol. 143,
Art. no. 105692, 2022, doi: 10.1016/j.cor.2021.105692.

[11] K. Davis, B. Peabody, and P. Leach, "Universally Unique IDentifiers (UUIDs)," IETF, RFC 9562,
May 2024, doi: 10.17487/RFC9562.

[12] Group 7, "Achievo Institute: Bluebook Companion User Stories," v2, Univ. of Makati, Sep. 18,
2026.

[13] Group 7, "System Modeling: Data Flow Diagrams, Use Case Diagram and Entity Relationship
Diagram," v1, Univ. of Makati, Oct. 14, 2026.

[14] K. P. Murphy, *Probabilistic Machine Learning: An Introduction*. Cambridge, MA, USA: MIT
Press, 2022.

[15] NumPy Developers, "NumPy Documentation," Version 2.x, 2024. [Online]. Available:
https://numpy.org/doc/stable/.

[16] The PostgreSQL Global Development Group, "PostgreSQL 17 Documentation: Row Security Policies
(Sec. 5.9)," 2024. [Online]. Available: https://www.postgresql.org/docs/17/.

[17] A. Wright, H. Andrews, B. Hutton, and G. Dennis, "JSON Schema: A Media Type for Describing
JSON Documents," IETF Internet-Draft draft-bhutton-json-schema-01 (JSON Schema Draft 2020-12),
Jun. 2022. [Online]. Available: https://json-schema.org/draft/2020-12/json-schema-core.

[18] Supabase, Inc., "Supabase Docs: Row Level Security; Edge Functions," 2026. [Online].
Available: https://supabase.com/docs.

[19] S. Ramírez, "FastAPI documentation: Concurrency and async / await," Version 0.115+, 2024.
[Online]. Available: https://fastapi.tiangolo.com/async/. *(Cited for its blocking-work guidance,
referenced in Section 6.1; the deployed gateway is a Supabase Edge Function, not a FastAPI
service - see Revision Notes.)*

[20] M. Richards and N. Ford, *Fundamentals of Software Architecture*, 2nd ed. Sebastopol, CA,
USA: O'Reilly Media, 2025.

[21] N. Ford, M. Richards, P. Sadalage, and Z. Dehghani, *Software Architecture: The Hard Parts -
Modern Trade-Off Analyses for Distributed Architectures*. Sebastopol, CA, USA: O'Reilly Media,
2021.

[22] R. Fielding, M. Nottingham, and J. Reschke, "HTTP Semantics," IETF, RFC 9110, Jun. 2022,
doi: 10.17487/RFC9110.

[23] Y. Sheffer, P. Saint-Andre, and T. Fossati, "Recommendations for Secure Use of Transport Layer
Security (TLS) and Datagram Transport Layer Security (DTLS)," IETF, BCP 195, RFC 9325, Nov. 2022,
doi: 10.17487/RFC9325.

[24] M. Nottingham, E. Wilde, and S. Dalal, "Problem Details for HTTP APIs," IETF, RFC 9457, Jul.
2023, doi: 10.17487/RFC9457.

[25] pytest-dev, "pytest Documentation," Version 8.x, 2024. [Online]. Available:
https://docs.pytest.org/. *(Historical reference only - the deployed engine's test suite uses
vitest, not pytest; see Revision Notes item 2.)*

[26] D. K. Panda and S. Ray, "Approaches and algorithms to mitigate cold start problems in
recommender systems: A systematic literature review," *Journal of Intelligent Information
Systems*, vol. 59, no. 2, pp. 341-366, 2022, doi: 10.1007/s10844-022-00698-5.

## AI Assistance Declaration

This document was drafted with AI assistance (Claude, Anthropic), revising the team's original
Milestone 1 proposal against the real, deployed implementation. Every revised claim in the
Revision Notes table cites a specific file or test in the repository, cross-checked against
`docs/MILESTONE1_CHECKLIST.md` and `docs/MILESTONE3_CHECKLIST.md` - both of which independently
verified their claims by running commands and reading source, not by assumption.

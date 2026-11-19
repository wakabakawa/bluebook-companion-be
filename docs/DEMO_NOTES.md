# Backend notes & demo Q&A

A plain-language summary of this backend, plus answers to the questions that tend to come up
when demoing it. `Blubook PBL ALGOCOM.pdf`'s own §6 "Academic Defense Questions" already covers
the Review Plan algorithm's design in depth (why DP, why decouple the engine, exact/heuristic
trade-offs) - this doc covers everything *around* the algorithm instead: Supabase, auth, security,
data, and the project decisions that aren't in that PDF.

## 1. Summary

This is a **Supabase project** (Postgres + Row Level Security + Auth + one Edge Function), not a
separate server. Three things it does:

1. **Serves the exam-set catalogue** (`v_sheet_catalog`/`v_sheet_items`) - what sets exist, their
   item tags (topic, difficulty, cognitive skill), but never the answer key or question text.
2. **Scores a submitted attempt** (`submit_attempt()`, a Postgres RPC) - the *only* code path that
   ever reads the answer key. The key lives in `app_private.answer_key_item`, a schema PostgREST
   never exposes, with RLS enabled and zero policies on top - nothing but this one function and an
   admin can touch it.
3. **Builds a review plan** (`plan-gateway`, a Supabase Edge Function) - runs the cardinality-
   constrained 0/1 knapsack DP (the algorithm from the ALGOCOM PDF) against the caller's own topic
   stats, which it reads itself from `v_topic_stats` - the client never sends its own history.

Identity: **anonymous Supabase Auth**, not a login. A student never creates an account; the app
silently signs in anonymously on first launch (after the privacy notice), which gets them a real,
server-verified `auth.uid()` - different from every other student's, but carrying no name, email,
or device identifier. Every table's Row Level Security policy is keyed off that id.

What's deliberately **not** built yet: the admin web app (Semester 2 per the Charter), answer-key
re-scoring after a correction (`engine_job` queue exists, no consumer), and item-level (as opposed
to topic-level) cohort comparison.

## 2. Demo Q&A

### Architecture

**"Is there a backend server, or is it just the database?"**
Just Supabase - Postgres, Auth, and one Edge Function (`plan-gateway`). No separate app server we
host ourselves. The "server-side logic" people expect (scoring, building a review plan) lives in
Postgres functions and that one Edge Function, not a Node/Express-style API layer.

**"Why Supabase instead of building your own backend?"**
The Charter's own tooling list already named Supabase (Auth, Postgres). It gave us Postgres + RLS,
anonymous auth, and a Deno runtime for the one piece of real compute (the review-plan algorithm)
without us running or patching servers ourselves - appropriate for this project's real traffic
level (a PBL cohort, not production scale).

**"What does the Edge Function actually do that the database can't?"**
Runs the knapsack DP. Everything else - reading the catalogue, scoring an attempt - is plain
Postgres (tables, views, RPCs) reached directly over PostgREST. The Edge Function exists only
because the DP is real CPU work that doesn't belong inside a SQL function.

**"What happens if the Edge Function crashes or times out?"**
It has its own internal timeout (1.5s) shorter than Supabase's own per-request CPU cap, so it can
return a proper `504 application/problem+json` body instead of just dying - the Android app's
error handling expects that shape and shows a retry.

### Security & privacy

**"Where's the answer key? Can a student get it?"**
`app_private.answer_key_item` - a schema not in Supabase's exposed-schemas list, so PostgREST
can't even route a request to it, independent of RLS. Then RLS is enabled on it anyway with *zero*
policies, so even if the schema exposure were misconfigured, no role but the table owner can read
it. We verified directly: a signed-in student's query against it returns "relation not found," not
a permission error - confirming it's genuinely unreachable, not just denied.
`submit_attempt()` is the one function allowed to read it (it's `SECURITY DEFINER`), and it never
returns the key itself to the client under any circumstance - only per-item right/wrong, never the
correct letter, not even for items the student already answered.

**"If there's no login, how do you know who's who? Can one student see another's data?"**
Anonymous sign-in still gives each install a real, unique, server-verified id (`auth.uid()`) - not
self-chosen. Every table's Row Level Security policy filters on `profile_id = auth.uid()`, so a
student's Postgres session can only ever see rows matching their own id, enforced by the database
itself, not application code that could have a bug. Two different students always get two
different ids; one student can never see another's attempts.

**"Is 'anonymous' actually anonymous, or just unauthenticated?"**
Both. No name, email, or device identifier is ever collected - the id is a random UUID the Auth
service generates on sign-in, with zero PII attached. "Anonymous" here means no identifying
credential, not "no identity" - the two are different, and the distinction is what makes RLS
possible at all while staying privacy-compliant.

**"What stops a student from tampering with their own score?"**
There's no INSERT/UPDATE policy on `attempt`/`item_response` for any interactive role, and no
grant either - the only writer is `submit_attempt()`. A student can't `INSERT` a fabricated
"correct" row even though RLS would otherwise let them read their own rows; write access and read
access are governed separately.

### Data & scale

**"What happens to cohort/aggregate stats - can one student's test data skew everyone's average?"**
Cohort figures (`topic_cohort`) only populate once an exam set passes a minimum-attempts threshold
(`cohort_min_attempts`, admin-configurable) - a single early tester's results don't show up as "the
average" for anyone. Below that threshold, the comparison screen just says "not enough data yet"
instead of showing a number.

**"What if the free Supabase tier runs out of room/compute?"**
This project's real data volume is small (one book edition, a few hundred items, a classroom-sized
cohort) - nowhere near typical free-tier Postgres storage or Edge Function invocation limits.
Exact current limits are on Supabase's pricing page; worth checking before scaling to a much larger
rollout, but not a concern at this project's stage.

**"Could this handle every student in the country using it at once?"**
Not as deployed today, and it was never meant to - the explicit scope is a PBL cohort. The
`plan-gateway` Edge Function scales horizontally by design (stateless, no DB connection held open
across requests), so that specific piece would scale; the free-tier Postgres instance underneath
would need upgrading well before real national-scale traffic.

### Algorithm (brief - see the PDF's §6 for the full defense)

**"How do you know the review-plan algorithm gives the right answer?"**
It's an exact dynamic program, not a heuristic - its output is checked against brute-force
exhaustive search on randomized test instances, and the worked example in the PDF's own spec
(objective `8.326601`, `372` DP cells) is reproduced exactly by the deployed code's test suite.

**"Why not use AI/machine learning to recommend what to review?"**
Nothing here needs it - the problem is a well-defined optimization (maximize expected recovered
items under a time budget), which a DP solves exactly and deterministically. An ML model would add
non-determinism and no accuracy benefit for a problem this size and well-structured.

### Project / process

**"What's left to build?"**
The admin web app (question bank management, answer-key publishing UI, dashboards) - Semester 2
scope. On the algorithm/backend side: re-scoring after an answer-key correction, and item-level (as
opposed to topic-level) cohort comparison.

**"Why TypeScript and not Python, if the design doc describes Python?"**
The design proposal (ALGOCOM PDF) was drafted generically; the team's actual implementation choice
was TypeScript from the first commit - same algorithm, same tests, just a different language than
the document's module-naming example. Documented explicitly in `MILESTONE1_CHECKLIST.md`'s gap
note rather than left as a silent mismatch.

**"How is this tested?"**
Three layers: the algorithm itself (DP vs. exhaustive search vs. greedy baseline, on randomized
instances), the Edge Function's contract (exact request/response shapes, matching the PDF's worked
example byte-for-byte), and manual verification against the live deployed project with a real
anonymous session (curl checks run directly against production after each schema change, not just
assumed to work).

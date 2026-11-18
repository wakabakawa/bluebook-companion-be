# Milestone 3 Checklist — Supabase integration (Task 4 architecture, reconciled)

Same purpose as `MILESTONE1_CHECKLIST.md`/`MILESTONE2_CHECKLIST.md`: mirror `Blubook PBL
ALGOCOM.pdf`'s claims against the real implementation by actually checking, not assuming. This
one covers the Supabase migration that replaced Milestone 2's standalone Fastify server — and,
unlike the first two milestones, every item below is a real **divergence** from the PDF's Task 4,
each one deliberate and already reasoned through elsewhere in this project, not an oversight.

- [x] The algorithmic core runs in-process, not as an isolated FastAPI worker
      PDF's Task 4.2 names Layer 4 an isolated "FastAPI worker" (`review_planner.service`),
      reached over HTTP, with "no database credentials" implying a separate process. Real system:
      `supabase/functions/plan-gateway/handler.ts` imports the engine directly —
      `import { planReview } from "../_shared/engine/service.js"` — compiled JS vendored
      in-process by `scripts/sync-engine.ts`. No FastAPI, no second HTTP hop, no separate engine
      service anywhere in this repo. Deliberate: merging the "architecture quantum" (Richards &
      Ford) is a fine trade at a PBL cohort's real traffic level; the *module* boundary
      (`planReview` as a pure, injected function with zero DB/network calls) is what was actually
      preserved, not the process boundary.
- [x] The PDF is internally inconsistent about where topic aggregation happens — the real system
      follows the architecture diagram, not the JSON example
      PDF's Task 4.1 diagram says the gateway "③ Builds topic aggregates with one SQL `GROUP BY`
      (no answer key leaves the DB)" — server-side aggregation. PDF's Task 4.3 example request
      JSON shows the *client* sending `topics: [...]` directly — contradicting its own diagram.
      Real `SolveRequest` (`supabase/functions/_shared/gateway/wire-types.ts`): `{ request_id,
      edition_id, params }` — no `profile_id`, no `topics[]`. `validate.ts`'s
      `allowedTop = new Set(["request_id", "edition_id", "params"])` rejects anything else. This
      matches the diagram's description and closes the literal JSON example's real security gap
      (trusting a client-supplied `profile_id`/`topics[]` with zero verification).
- [x] The identity mechanism changed, not just the wire shape
      PDF §1.2 (citing RE FR02, NFR01, BR04): "each phone holds a random profile ID (UUIDv4) not
      derived from any device identifier" — a client-generated, self-asserted id, trusted as-is
      (this was literally Milestone 2's `LocalStore.profileId()`, sent as `profile_id` with zero
      server verification). Real system: Supabase anonymous sign-in
      (`AuthRepository.ensureSession()` → `auth.signInAnonymously()`) — a server-issued,
      JWT-verified id (`auth.uid()`). Every RLS policy and RPC resolves identity from the verified
      session, never a client-supplied value: `profile_id = auth.uid()` throughout
      `supabase/migrations/20261117123320_attempts.sql`; `submit_attempt()`'s
      `v_profile uuid := auth.uid()` in `20261117123325_functions.sql`. Still satisfies NFR01 (no
      device-derived id, still anonymous/no PII) and still distinguishes one install from
      another — a strictly stronger mechanism than the PDF describes, not a weaker one.
- [x] Timeout values differ from the PDF's stated "2 s"
      `supabase/functions/_shared/gateway/engine-meta.ts`: `ENGINE_TIMEOUT_MS = 1500` (1.5s).
      `handler.ts` adds a separate, hardcoded 3000ms upstream DB-fetch timeout
      ("database did not answer within 3s") that the PDF's topology doesn't describe at all,
      since in the PDF's architecture the gateway's own DB round-trip isn't a documented latency
      source the way it is once the gateway builds aggregates itself (see item 2 above).
- [x] The worked example still matches, through the new path
      `tests/contract.test.ts`: `objective).toBe(8.326601)`, `dp_cells).toBe(372)` — same numbers
      Milestone 1/2 already verified, now exercised through the Edge Function's handler rather
      than the old Fastify route. The engine itself was untouched by this migration.
- [x] The PDF's test-count claims don't match the real suite, and probably never described it
      PDF cites "173 tests, all passed," "151/151," and "120 randomized instances" in several
      places (§5.3, §5.4, §7.1). Real suite: 3 files (`contract.test.ts`, `optimality.test.ts`,
      `edgeCases.test.ts`), ~39 `it`/`test` occurrences total. No trace of those specific counts
      anywhere in this repo. Likely explanation: a separate, larger prototype (possibly the Python
      one from `MILESTONE1_CHECKLIST.md`'s amended gap note) that was never committed here. Stated
      plainly rather than assumed to be close enough.

## How to reproduce

```
distrobox enter bluebook-engine
cd bluebook-companion-be
npm test                                        # engine + contract tests, same numbers as Milestone 1/2
grep -n "import.*service" supabase/functions/plan-gateway/handler.ts   # in-process, not HTTP
cat supabase/functions/_shared/gateway/wire-types.ts                    # no profile_id, no topics[]
grep -n "auth.uid()" supabase/migrations/20261117123320_attempts.sql    # server-verified identity
```
Verified against the deployed production project (ref `idilswwvuyepojfcbpse`) with a real
anonymous-signed-in session: `v_sheet_catalog`/`v_sheet_items`/`v_topic_stats` all return rows (or
correctly empty/null pending a published key or a cold-start profile) without the permission
errors an unverified, self-asserted identity scheme would have no way to prevent.

## Out of scope for this milestone

The web admin app (Semester 2), BR07 re-scoring's `engine_job` consumer (schema exists, no
producer yet — see `MILESTONE1_CHECKLIST.md`'s predecessor note and
`20261117123323_operations.sql`'s own comment), and item-level (as opposed to topic-level)
Anonymous Cohort Comparison, which would need a new published `item_cohort` projection mirroring
`topic_catalog`→`topic_cohort` — not built, deliberately deferred as real net-new backend work
rather than folded into this pass.

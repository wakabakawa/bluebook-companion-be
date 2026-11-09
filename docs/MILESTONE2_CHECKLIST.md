# Milestone 2 Checklist — HTTP API + Android wiring (Task 4: Decoupled Architecture)

Scope: wrap the Milestone 1 engine in a standalone HTTP API matching the PDF's §4.3 Interface
Data Contract, callable directly by the Android app. No Supabase/Postgres/Auth in this pass —
that remains a later milestone per the PDF's own backlog (§5.3).

- [x] Request/response match the PDF's §4.3 JSON contract (snake_case, same field names/shapes)
      Verified by hand against the PDF's own worked-example request/response on page 14-15, and
      by `tests/contract.test.ts` cases 1-2 asserting the exact numbers end-to-end.
- [x] `POST /api/v1/algorithm/solve` reproduces the PDF's worked example exactly over real HTTP
      `curl` smoke test against a running `npm run dev` server: objective `8.326601` at q=1
      (`dp_cells: 372`), `8.926601` at q=0 — byte-for-byte the engine's own numbers, now through
      the full HTTP envelope (not just `app.inject()`).
- [x] JSON Schema 2020-12 validation rejects malformed input before it reaches the engine
      `additionalProperties: false` everywhere; `budget_min` 1-600, `min_strong` 0-5, `topics`
      maxItems 750, `correct <= answered` via Ajv's `$data`. 422 with a field-pointing `detail`.
- [x] The one thing JSON Schema can't express (duplicate `topic_id`) still gets rejected
      Falls through to the engine's own `InputError`, mapped to the same 422 shape — verified it
      never reaches the generic 500 handler (`tests/contract.test.ts` case 18).
- [x] Every outcome in the PDF's §4.3 outcome table produces the documented HTTP status
      200 (solved, any status flag) / 400 (not JSON) / 422 (schema or semantic violation) / 404
      (unknown route, not in the PDF's table but needed so the service never 500s on a typo'd
      path) — all `application/problem+json`, exactly the five RFC 9457 fields, nothing extra.
- [x] The engine stays an isolated, stateless core — API layer never does its job for it
      `api/routes/solve.ts` only maps wire shapes in and out; `planReview` itself is untouched by
      this milestone (same 175 Milestone-1 tests still pass unmodified).
- [x] 2-second timeout rule is honest, not theater
      No worker-thread/timeout-wrapper machinery — `planReview` is synchronous and CPU-bound, so
      nothing can preempt it mid-run anyway. Instead: a post-hoc check against the engine's own
      `metrics.runtimeMs` as a 504 backstop, plus a regression test (case 23: 750 topics,
      `budget_min=600`, `min_strong=5`) pinning the worst case under 500ms — three orders of
      magnitude under the 2s budget, matching Milestone 1's own benchmark numbers.
- [x] Two contract mismatches found by independently designing the API and the Android client
      were fixed before either side was built: `topic_id` schema pattern was too restrictive for
      real composite ids with spaces (loosened to length-only), and `book_page_ref` was assumed
      to be a string on one side vs. the Android app's real `Int?` source field (fixed to
      `integer|null` on both request and response schemas).

## How to reproduce

```
distrobox enter bluebook-engine
cd bluebook-companion-be
npm install
npm test                                        # 202 tests: engine + contract
npm run dev                                      # starts the server on :8787
curl -X POST http://localhost:8787/api/v1/algorithm/solve \
  -H 'Content-Type: application/json' -d @<worked-example-request>.json
```

## Out of scope for this milestone

Supabase schema/RLS, the `plan-gateway` Edge Function, auth, persistence, the approximate-
fallback mode (`exact: false`) — all later milestones per the PDF's §5.3 backlog
(DEV-ALGO-102..104, 106).

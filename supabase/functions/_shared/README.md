Vendored code shared by Edge Functions. Never hand-edited directly.

- `engine/` — `engine/review-planner/`'s compiled (`npm run build`) output, copied in verbatim.
  The canonical source stays `../../../engine/review-planner/` at the repo root.
- `gateway/` — the portable (framework-agnostic) parts of `../../../api/`: schemas, wire-types,
  mappers, problem responses.

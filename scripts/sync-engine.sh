#!/usr/bin/env bash
# Vendors the engine's compiled output into supabase/functions/_shared/engine/ so the
# Edge Function can import real .js files (Deno won't resolve the source's NodeNext
# .js-pointing-at-.ts specifiers). Only the four files service.ts actually needs are
# vendored — reference.ts/baselines.ts/index.ts are test-only and would drag brute-force
# baselines into the deployed bundle for no reason.
#
# --check: exit 1 if the vendored copies differ from a fresh build (drift detection, CI).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

npm run build >/dev/null

SRC=dist/engine/review-planner
DEST=supabase/functions/_shared/engine
FILES=(types.js priorities.js knapsack.js service.js)

if [[ "${1:-}" == "--check" ]]; then
  fail=0
  for f in "${FILES[@]}"; do
    if ! diff -q "$SRC/$f" "$DEST/$f" >/dev/null 2>&1; then
      echo "drift: $DEST/$f does not match a fresh build of $SRC/$f" >&2
      fail=1
    fi
  done
  exit $fail
fi

mkdir -p "$DEST"
for f in "${FILES[@]}"; do
  cp "$SRC/$f" "$DEST/$f"
done
echo "Vendored ${FILES[*]} into $DEST"

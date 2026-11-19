// Vendors the engine's compiled output into supabase/functions/_shared/engine/ so the
// Edge Function can import real .js files (Deno won't resolve the source's NodeNext
// .js-pointing-at-.ts specifiers). Only the four files service.ts actually needs are
// vendored - reference.ts/baselines.ts/index.ts are test-only and would drag brute-force
// baselines into the deployed bundle for no reason.
//
// Cross-platform (Windows, macOS, Linux) - replaces the old bash-only version.
// --check: exit 1 if the vendored copies differ from a fresh build (drift detection, CI).

import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(repoRoot, "dist/engine/review-planner");
const DEST = join(repoRoot, "supabase/functions/_shared/engine");
const FILES = ["types.js", "priorities.js", "knapsack.js", "service.js"];

execSync("npm run build", { cwd: repoRoot, stdio: "ignore" });

if (process.argv[2] === "--check") {
  let fail = false;
  for (const f of FILES) {
    const src = readFileSync(join(SRC, f));
    let dest: Buffer;
    try {
      dest = readFileSync(join(DEST, f));
    } catch {
      console.error(`drift: ${join(DEST, f)} is missing`);
      fail = true;
      continue;
    }
    if (!src.equals(dest)) {
      console.error(`drift: ${join(DEST, f)} does not match a fresh build of ${join(SRC, f)}`);
      fail = true;
    }
  }
  process.exit(fail ? 1 : 0);
}

mkdirSync(DEST, { recursive: true });
for (const f of FILES) {
  copyFileSync(join(SRC, f), join(DEST, f));
}
console.log(`Vendored ${FILES.join(", ")} into ${DEST}`);

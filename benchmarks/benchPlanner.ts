import { writeFileSync } from "node:fs";
import { computePriorities } from "../engine/review-planner/priorities.js";
import { solveDp } from "../engine/review-planner/knapsack.js";
import { bruteForce, greedyRatio } from "../engine/review-planner/baselines.js";
import { DEFAULT_PARAMS } from "../engine/review-planner/types.js";
import { mulberry32, syntheticTopics } from "./synthetic.js";

interface Record_ {
  label: string;
  n: number;
  B: number;
  q: number;
  cells: number;
  runtimeMs: number;
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function timeMedian(fn: () => void, runs: number): number {
  fn(); // warm-up: avoid JIT cold-start noise in the first measured sample
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  return median(samples);
}

function linregress(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number } {
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - meanX) * (ys[i]! - meanY);
    den += (xs[i]! - meanX) ** 2;
  }
  const slope = num / den;
  const intercept = meanY - slope * meanX;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * xs[i]! + intercept;
    ssRes += (ys[i]! - pred) ** 2;
    ssTot += (ys[i]! - meanY) ** 2;
  }
  const r2 = 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

const RUNS = 7;
const records: Record_[] = [];

// --- Grid A: cost-per-cell growth (Fig. 1 data) ---
const cellGrid: Array<{ n: number; B: number; q: number }> = [];
const ns = [50, 100, 150, 200, 300, 400, 500, 600, 700, 750];
const bs = [60, 120, 240, 360, 480, 600];
ns.forEach((n, i) => {
  cellGrid.push({ n, B: bs[i % bs.length]!, q: i % 2 === 0 ? 0 : 3 });
});

for (const { n, B, q } of cellGrid) {
  const rng = mulberry32(n * 31 + B * 7 + q);
  const topics = syntheticTopics(rng, n);
  const params = { ...DEFAULT_PARAMS, budgetMin: B, minStrong: q };
  const { scored } = computePriorities(topics, params);

  const runtimeMs = timeMedian(() => solveDp(scored, B, q), RUNS);
  const cells = n * (q + 1) * (B + 1);
  records.push({ label: "dp-cells", n, B, q, cells, runtimeMs });
}

console.log("\n=== Grid A: DP runtime vs. DP cells ===");
console.table(
  records.map((r) => ({ n: r.n, B: r.B, q: r.q, cells: r.cells, "median ms": r.runtimeMs.toFixed(3) }))
);

const { slope, r2 } = linregress(
  records.map((r) => r.cells),
  records.map((r) => r.runtimeMs)
);
console.log(`Linear fit: ${(slope * 1_000_000).toFixed(2)} ms per million cells, R^2 = ${r2.toFixed(4)}`);

// --- Grid B: DP vs exhaustive search growth (Fig. 2 data) ---
const exhaustiveGrid = [8, 10, 12, 14, 16, 18, 20];
const B2 = 60;
const q2 = 1;
const dpVsExhaustive: Array<{ n: number; dpMs: number; exhaustiveMs: number; ratio: string }> = [];

for (const n of exhaustiveGrid) {
  const rng = mulberry32(n * 101 + 3);
  const topics = syntheticTopics(rng, n);
  const params = { ...DEFAULT_PARAMS, budgetMin: B2, minStrong: q2 };
  const { scored } = computePriorities(topics, params);

  const dpMs = timeMedian(() => solveDp(scored, B2, q2), RUNS);
  const exhaustiveRuns = n <= 16 ? RUNS : 3;
  const exhaustiveMs = timeMedian(() => bruteForce(scored, B2, q2), exhaustiveRuns);

  dpVsExhaustive.push({ n, dpMs, exhaustiveMs, ratio: (exhaustiveMs / dpMs).toFixed(1) });
  records.push({ label: "dp-vs-exhaustive(dp)", n, B: B2, q: q2, cells: n * (q2 + 1) * (B2 + 1), runtimeMs: dpMs });
  records.push({
    label: "dp-vs-exhaustive(exhaustive)",
    n,
    B: B2,
    q: q2,
    cells: n * (q2 + 1) * (B2 + 1),
    runtimeMs: exhaustiveMs,
  });
}

console.log("\n=== Grid B: DP vs exhaustive search (B=60, q=1) ===");
console.table(
  dpVsExhaustive.map((r) => ({
    n: r.n,
    "DP ms": r.dpMs.toFixed(3),
    "exhaustive ms": r.exhaustiveMs.toFixed(3),
    "exhaustive/DP": r.ratio,
  }))
);

// --- Greedy gap vs DP objective (§6.3 claim) ---
const gapParams = { ...DEFAULT_PARAMS, budgetMin: 90, minStrong: 0 };
const gaps: number[] = [];
const GAP_INSTANCES = 200;

for (let seed = 1; seed <= GAP_INSTANCES; seed++) {
  const rng = mulberry32(seed * 977 + 1);
  const topics = syntheticTopics(rng, 120);
  const { scored } = computePriorities(topics, gapParams);
  const dp = solveDp(scored, gapParams.budgetMin, 0);
  const greedy = greedyRatio(scored, gapParams.budgetMin);
  const gapPct = dp.objective > 0 ? ((dp.objective - greedy.objective) / dp.objective) * 100 : 0;
  gaps.push(gapPct);
}

const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
const worstGap = Math.max(...gaps);
const optimalCount = gaps.filter((g) => g <= 1e-9).length;

console.log("\n=== Greedy gap vs DP (120 topics, B=90, q=0, 200 instances) ===");
console.table([
  {
    instances: GAP_INSTANCES,
    "greedy optimal in": optimalCount,
    "mean gap %": meanGap.toFixed(3),
    "worst gap %": worstGap.toFixed(3),
  },
]);

writeFileSync("benchmarks/results.json", JSON.stringify(records, null, 2));
console.log(`\nWrote ${records.length} records to benchmarks/results.json`);

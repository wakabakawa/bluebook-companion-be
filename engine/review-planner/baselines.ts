import { ScoredTopic } from "./types.js";
import { DpResult } from "./knapsack.js";

/** Unpruned exhaustive search over all 2^n subsets. Test oracle only — do not use past n~20. */
export function bruteForce(items: ScoredTopic[], budgetMin: number, minStrong: number): DpResult {
  const n = items.length;
  const B = budgetMin;

  for (let qq = minStrong; qq >= 0; qq--) {
    let bestValue = -Infinity;
    let bestMask = -1;

    for (let mask = 0; mask < 1 << n; mask++) {
      let cost = 0;
      let strongCount = 0;
      let value = 0;
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) {
          const item = items[i]!;
          cost += item.k;
          if (item.s) strongCount++;
          value += item.v;
        }
      }
      if (cost <= B && strongCount >= qq && value > bestValue) {
        bestValue = value;
        bestMask = mask;
      }
    }

    if (bestMask !== -1) {
      const selectedIds: string[] = [];
      for (let i = 0; i < n; i++) {
        if (bestMask & (1 << i)) selectedIds.push(items[i]!.id);
      }
      return {
        status: qq === minStrong ? "OPTIMAL" : "OPTIMAL_RELAXED_Q",
        objective: bestValue,
        selectedIds,
        qUsed: qq,
        dpCells: n * (minStrong + 1) * (B + 1),
      };
    }
  }

  // qq = 0 (empty selection) is always feasible, so this is unreachable.
  throw new Error("bruteForce: no feasible subset found even at q=0");
}

/**
 * Greedy by value/cost density (v/k), Θ(n log n). Ignores the minStrong (q) constraint
 * entirely — kept only as the PDF's literature-baseline counterexample to optimal DP.
 */
export function greedyRatio(items: ScoredTopic[], budgetMin: number): DpResult {
  const n = items.length;
  const B = budgetMin;

  const order = [...items].sort((a, b) => b.v / b.k - a.v / a.k || a.id.localeCompare(b.id));

  let remaining = B;
  let value = 0;
  let strongCount = 0;
  const selectedIds: string[] = [];

  for (const item of order) {
    if (item.k <= remaining) {
      selectedIds.push(item.id);
      remaining -= item.k;
      value += item.v;
      if (item.s) strongCount++;
    }
  }

  return {
    status: "OPTIMAL",
    objective: value,
    selectedIds,
    qUsed: strongCount,
    dpCells: n * 1 * (B + 1),
  };
}

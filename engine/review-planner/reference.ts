import { ScoredTopic } from "./types.js";
import { DpResult } from "./knapsack.js";

/** Scalar oracle: full 3D table, plain nested loops, no rolling rows or typed arrays. */
export function solveDpReference(items: ScoredTopic[], budgetMin: number, minStrong: number): DpResult {
  const n = items.length;
  const B = budgetMin;
  const q = minStrong;

  const G: number[][][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: q + 1 }, () => new Array(B + 1).fill(-Infinity))
  );
  for (let b = 0; b <= B; b++) G[0]![0]![b] = 0;

  const keep: boolean[][][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: q + 1 }, () => new Array(B + 1).fill(false))
  );

  for (let i = 1; i <= n; i++) {
    const item = items[i - 1]!;
    const k = item.k;
    const v = item.v;
    const sInc = item.s ? 1 : 0;

    for (let j = 0; j <= q; j++) {
      for (let b = 0; b <= B; b++) {
        let best = G[i - 1]![j]![b]!;
        if (k <= b) {
          const prevJ = Math.max(0, j - sInc);
          const prevVal = G[i - 1]![prevJ]![b - k]!;
          if (prevVal !== -Infinity) {
            const cand = v + prevVal;
            if (cand > best) {
              best = cand;
              keep[i]![j]![b] = true;
            }
          }
        }
        G[i]![j]![b] = best;
      }
    }
  }

  let qUsed = q;
  while (qUsed > 0 && G[n]![qUsed]![B] === -Infinity) qUsed--;

  const objective = G[n]![qUsed]![B]!;

  const selectedIds: string[] = [];
  let j = qUsed;
  let b = B;
  for (let i = n; i >= 1; i--) {
    if (keep[i]![j]![b]) {
      const item = items[i - 1]!;
      selectedIds.unshift(item.id);
      b -= item.k;
      j = Math.max(0, j - (item.s ? 1 : 0));
    }
  }

  return {
    status: qUsed === q ? "OPTIMAL" : "OPTIMAL_RELAXED_Q",
    objective,
    selectedIds,
    qUsed,
    dpCells: n * (q + 1) * (B + 1),
  };
}

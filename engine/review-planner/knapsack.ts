import { ScoredTopic } from "./types.js";

export interface DpResult {
  status: "OPTIMAL" | "OPTIMAL_RELAXED_Q";
  objective: number;
  selectedIds: string[];
  qUsed: number;
  dpCells: number;
}

/** Cardinality-constrained 0/1 knapsack DP (PDF §2.2-2.3): rolling rows + a keep bit-table. */
export function solveDp(items: ScoredTopic[], budgetMin: number, minStrong: number): DpResult {
  const n = items.length;
  const B = budgetMin;
  const q = minStrong;

  let G: Float64Array[] = Array.from({ length: q + 1 }, () => new Float64Array(B + 1).fill(-Infinity));
  G[0]!.fill(0);

  const keep = new Uint8Array(n * (q + 1) * (B + 1));
  const idx = (i: number, j: number, b: number) => (i * (q + 1) + j) * (B + 1) + b;

  for (let i = 0; i < n; i++) {
    const item = items[i]!;
    const k = item.k;
    if (k > B) continue;
    const v = item.v;
    const sInc = item.s ? 1 : 0;

    const Gp: Float64Array[] = G.map((row) => row.slice());

    for (let j = 0; j <= q; j++) {
      const prevRow = G[Math.max(0, j - sInc)]!;
      const curRow = Gp[j]!;
      for (let b = k; b <= B; b++) {
        const prevVal = prevRow[b - k]!;
        if (prevVal === -Infinity) continue;
        const cand = v + prevVal;
        if (cand > curRow[b]!) {
          curRow[b] = cand;
          keep[idx(i, j, b)] = 1;
        }
      }
    }
    G = Gp;
  }

  let qUsed = q;
  while (qUsed > 0 && G[qUsed]![B] === -Infinity) qUsed--;

  const objective = G[qUsed]![B]!;

  const selectedIds: string[] = [];
  let j = qUsed;
  let b = B;
  for (let i = n - 1; i >= 0; i--) {
    if (keep[idx(i, j, b)] === 1) {
      const item = items[i]!;
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

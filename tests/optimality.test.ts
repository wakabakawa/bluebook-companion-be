import { describe, expect, it } from "vitest";
import { computePriorities } from "../engine/review-planner/priorities.js";
import { solveDp } from "../engine/review-planner/knapsack.js";
import { solveDpReference } from "../engine/review-planner/reference.js";
import { bruteForce, greedyRatio } from "../engine/review-planner/baselines.js";
import { mulberry32, paramsWith, randomTopics } from "./testUtils.js";

const EPS = 1e-6;

function recomputeValue(scored: ReturnType<typeof computePriorities>["scored"], ids: string[]) {
  const byId = new Map(scored.map((s) => [s.id, s]));
  let cost = 0;
  let strongCount = 0;
  let value = 0;
  for (const id of ids) {
    const t = byId.get(id)!;
    cost += t.k;
    if (t.s) strongCount++;
    value += t.v;
  }
  return { cost, strongCount, value };
}

describe("DP optimality vs exhaustive search", () => {
  const seeds = Array.from({ length: 40 }, (_, i) => i + 1);
  const qValues = [0, 1, 2];

  for (const seed of seeds) {
    for (const q of qValues) {
      it(`matches brute force (seed=${seed}, q=${q})`, () => {
        const rng = mulberry32(seed * 1000 + q);
        const n = 8 + Math.floor(rng() * 9); // 8..16, keep 2^n cheap
        const topics = randomTopics(rng, n);
        const params = paramsWith({ budgetMin: 30 + Math.floor(rng() * 90), minStrong: q });

        const { scored } = computePriorities(topics, params);
        const dp = solveDp(scored, params.budgetMin, params.minStrong);
        const brute = bruteForce(scored, params.budgetMin, params.minStrong);

        expect(dp.qUsed).toBe(brute.qUsed);
        expect(dp.objective).toBeCloseTo(brute.objective, 6);

        const rebuilt = recomputeValue(scored, dp.selectedIds);
        expect(rebuilt.cost).toBeLessThanOrEqual(params.budgetMin);
        expect(rebuilt.strongCount).toBeGreaterThanOrEqual(dp.qUsed);
        expect(rebuilt.value).toBeCloseTo(dp.objective, 6);
      });
    }
  }
});

describe("vectorised DP equals scalar reference", () => {
  for (let seed = 1; seed <= 20; seed++) {
    it(`solveDp === solveDpReference (seed=${seed})`, () => {
      const rng = mulberry32(seed * 7 + 1);
      const n = 10 + Math.floor(rng() * 40); // 10..50
      const topics = randomTopics(rng, n);
      const params = paramsWith({ budgetMin: 60 + Math.floor(rng() * 180), minStrong: Math.floor(rng() * 4) });

      const { scored } = computePriorities(topics, params);
      const dp = solveDp(scored, params.budgetMin, params.minStrong);
      const ref = solveDpReference(scored, params.budgetMin, params.minStrong);

      expect(dp.qUsed).toBe(ref.qUsed);
      expect(dp.objective).toBeCloseTo(ref.objective, 6);
    });
  }
});

describe("DP vs greedy (unconstrained, q=0)", () => {
  for (let seed = 1; seed <= 20; seed++) {
    it(`DP objective >= greedy objective (seed=${seed}, n=60)`, () => {
      const rng = mulberry32(seed * 13 + 5);
      const topics = randomTopics(rng, 60);
      const params = paramsWith({ budgetMin: 60 + Math.floor(rng() * 300), minStrong: 0 });

      const { scored } = computePriorities(topics, params);
      const dp = solveDp(scored, params.budgetMin, 0);
      const greedy = greedyRatio(scored, params.budgetMin);

      expect(dp.objective).toBeGreaterThanOrEqual(greedy.objective - EPS);
    });
  }

  it("has at least one strict counterexample where greedy is suboptimal", () => {
    // Mirrors the PDF §1.6 worked example: high density crowds out higher total value.
    const rng = mulberry32(42);
    const topics = randomTopics(rng, 30);
    const params = paramsWith({ budgetMin: 50, minStrong: 0 });

    const { scored } = computePriorities(topics, params);
    const dp = solveDp(scored, params.budgetMin, 0);
    const greedy = greedyRatio(scored, params.budgetMin);

    expect(dp.objective).toBeGreaterThan(greedy.objective + EPS);
  });
});

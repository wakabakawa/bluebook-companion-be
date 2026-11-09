import { DEFAULT_PARAMS, Params, TopicStat } from "../engine/review-planner/types.js";

/** Deterministic PRNG (mulberry32) so test failures are reproducible from the seed alone. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomTopics(rng: () => number, n: number): TopicStat[] {
  const topics: TopicStat[] = [];
  for (let i = 0; i < n; i++) {
    const N = 1 + Math.floor(rng() * 4);
    const a = Math.floor(rng() * (N * 3 + 1));
    const c = Math.floor(rng() * (a + 1));
    const daysSincePractice = rng() < 0.15 ? null : Math.floor(rng() * 30);
    const cohortMastery = rng() < 0.3 ? null : Math.round(rng() * 100) / 100;
    const refSeconds = [30, 60, 120][Math.floor(rng() * 3)]!;
    topics.push({ id: `T${i}`, N, a, c, daysSincePractice, cohortMastery, refSeconds });
  }
  return topics;
}

export function paramsWith(overrides: Partial<Params>): Params {
  return { ...DEFAULT_PARAMS, ...overrides };
}

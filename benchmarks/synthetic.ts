import { TopicStat } from "../engine/review-planner/types.js";

/** Deterministic PRNG (mulberry32) so benchmark runs are reproducible from the seed alone. */
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

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * Generator calibrated to the PDF's §5.4 provenance: 1-4 items per topic, reference
 * times of 30/60/120s, mean mastery near 62.5%.
 */
export function syntheticTopics(rng: () => number, n: number): TopicStat[] {
  const topics: TopicStat[] = [];
  for (let i = 0; i < n; i++) {
    const N = 1 + Math.floor(rng() * 4);
    const a = 2 + Math.floor(rng() * 10);
    const masteryDraw = clamp(0.625 + (rng() - 0.5) * 0.3, 0, 1);
    const c = Math.round(a * masteryDraw);
    const daysSincePractice = rng() < 0.1 ? null : Math.floor(rng() * 21);
    const cohortMastery = rng() < 0.2 ? null : Math.round(rng() * 100) / 100;
    const refSeconds = [30, 60, 120][Math.floor(rng() * 3)]!;
    topics.push({ id: `topic-${i}`, N, a, c, daysSincePractice, cohortMastery, refSeconds });
  }
  return topics;
}

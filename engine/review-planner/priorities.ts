import { InputError, Params, ScoredTopic, TopicStat } from "./types.js";

export function validateInput(topics: TopicStat[], params: Params): void {
  if (!Number.isFinite(params.budgetMin) || params.budgetMin < 1 || params.budgetMin > 600) {
    throw new InputError(`budgetMin out of range [1, 600]: ${params.budgetMin}`);
  }
  if (!Number.isFinite(params.minStrong) || params.minStrong < 0 || params.minStrong > 5) {
    throw new InputError(`minStrong out of range [0, 5]: ${params.minStrong}`);
  }

  const seen = new Set<string>();
  for (const t of topics) {
    if (seen.has(t.id)) {
      throw new InputError(`duplicate topic id: ${t.id}`);
    }
    seen.add(t.id);

    if (!(t.c >= 0 && t.c <= t.a)) {
      throw new InputError(`topic ${t.id}: requires 0 <= c <= a (got c=${t.c}, a=${t.a})`);
    }
    if (!Number.isFinite(t.refSeconds) || t.refSeconds <= 0) {
      throw new InputError(`topic ${t.id}: refSeconds must be > 0 (got ${t.refSeconds})`);
    }
    if (t.daysSincePractice !== null && (!Number.isFinite(t.daysSincePractice) || t.daysSincePractice < 0)) {
      throw new InputError(`topic ${t.id}: daysSincePractice must be >= 0 or null (got ${t.daysSincePractice})`);
    }
    if (t.cohortMastery !== null && (t.cohortMastery < 0 || t.cohortMastery > 1)) {
      throw new InputError(`topic ${t.id}: cohortMastery must be in [0, 1] or null (got ${t.cohortMastery})`);
    }
  }
}

export function computePriorities(
  topics: TopicStat[],
  params: Params
): { scored: ScoredTopic[]; excludedTopicIds: string[] } {
  const scored: ScoredTopic[] = [];
  const excludedTopicIds: string[] = [];

  for (const t of topics) {
    if (t.N === 0) {
      excludedTopicIds.push(t.id);
      continue;
    }

    const pi = t.cohortMastery ?? params.defaultPrior;
    const mu = (t.c + params.priorStrength * pi) / (t.a + params.priorStrength);
    const w = 1 - mu;
    const r = t.daysSincePractice === null ? 1 : 1 - Math.pow(2, -t.daysSincePractice / params.halfLifeDays);
    const reliable = t.a >= params.minItems;
    const strong = mu >= params.strongThreshold;
    const k = Math.ceil((params.reviewFactor * t.N * t.refSeconds) / 60);
    const v = t.N * (w + params.recencyWeight * r);

    scored.push({ id: t.id, N: t.N, mu, w, r, reliable, strong, s: reliable && strong, k, v });
  }

  return { scored, excludedTopicIds };
}

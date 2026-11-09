import { Certificate, DEFAULT_PARAMS, Params, TopicStat } from "../engine/review-planner/types.js";
import { ENGINE_META } from "./engine-meta.js";
import { SolveResponse, WireParams, WireTopic } from "./wire-types.js";

export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export function round3(n: number): number {
  return Math.round(n * 1e3) / 1e3;
}

export function toParams(wire: WireParams): Params {
  return {
    ...DEFAULT_PARAMS,
    budgetMin: wire.budget_min,
    minStrong: wire.min_strong,
    ...(wire.strong_threshold !== undefined && { strongThreshold: wire.strong_threshold }),
    ...(wire.min_items !== undefined && { minItems: wire.min_items }),
    ...(wire.prior_strength !== undefined && { priorStrength: wire.prior_strength }),
    ...(wire.default_prior !== undefined && { defaultPrior: wire.default_prior }),
    ...(wire.recency_weight !== undefined && { recencyWeight: wire.recency_weight }),
    ...(wire.half_life_days !== undefined && { halfLifeDays: wire.half_life_days }),
    ...(wire.review_factor !== undefined && { reviewFactor: wire.review_factor }),
  };
}

export function toTopicStats(wireTopics: WireTopic[]): TopicStat[] {
  return wireTopics.map((t) => ({
    id: t.topic_id,
    N: t.items_in_book,
    a: t.answered,
    c: t.correct,
    daysSincePractice: t.days_since_practice,
    cohortMastery: t.cohort_mastery,
    refSeconds: t.ref_time_sec,
  }));
}

export function bookPageRefIndex(wireTopics: WireTopic[]): Map<string, number | null> {
  return new Map(wireTopics.map((t) => [t.topic_id, t.book_page_ref ?? null]));
}

export function toSolveResponse(requestId: string, cert: Certificate, pageRefs: Map<string, number | null>): SolveResponse {
  const strongSelected = cert.plan.filter((p) => p.strong && p.reliable).length;

  return {
    request_id: requestId,
    status: cert.status,
    engine: ENGINE_META,
    certificate: {
      exact: true,
      objective: round6(cert.objective),
      budget_min: cert.budgetMin,
      total_cost_min: cert.totalCostMin,
      q_requested: cert.qRequested,
      q_used: cert.qUsed,
      strong_selected: strongSelected,
      plan: cert.plan.map((p) => ({
        rank: p.rank,
        topic_id: p.topicId,
        cost_min: p.costMin,
        value: round6(p.value),
        mastery: round6(p.mastery),
        weakness: round6(p.weakness),
        staleness: round6(p.staleness),
        strong: p.strong,
        reliable: p.reliable,
        book_page_ref: pageRefs.get(p.topicId) ?? null,
      })),
      excluded_topic_ids: cert.excludedTopicIds,
    },
    metrics: {
      n_topics: cert.metrics.nTopics,
      dp_cells: cert.metrics.dpCells,
      runtime_ms: round3(cert.metrics.runtimeMs),
    },
    warnings: cert.warnings,
  };
}

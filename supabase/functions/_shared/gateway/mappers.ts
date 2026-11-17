import { Certificate, DEFAULT_PARAMS, Params, TopicStat } from "../engine/types.js";
import { ENGINE_META } from "./engine-meta.ts";
import { DbTopicRow, SolveResponse, WireParams } from "./wire-types.ts";

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

export function toTopicStats(rows: DbTopicRow[], now: number): TopicStat[] {
  return rows.map((r) => ({
    id: r.topic_id,
    N: r.items_in_book,
    a: r.answered,
    c: r.correct,
    daysSincePractice:
      r.last_practiced === null ? null : Math.max(0, Math.floor((now - Date.parse(r.last_practiced)) / 86_400_000)),
    cohortMastery: r.cohort_mastery === null ? null : Number(r.cohort_mastery),
    refSeconds: r.ref_seconds,
  }));
}

export function toSolveResponse(requestId: string, cert: Certificate, rows: DbTopicRow[]): SolveResponse {
  const byTopicId = new Map(rows.map((r) => [r.topic_id, r]));
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
      plan: cert.plan.map((p) => {
        const row = byTopicId.get(p.topicId);
        return {
          rank: p.rank,
          topic_id: p.topicId,
          topic_label: row?.topic_label ?? p.topicId,
          subject_label: row?.subject_label ?? "",
          branch_label: row?.branch_label ?? "",
          cost_min: p.costMin,
          value: round6(p.value),
          mastery: round6(p.mastery),
          weakness: round6(p.weakness),
          staleness: round6(p.staleness),
          strong: p.strong,
          reliable: p.reliable,
          book_page_ref: row?.book_page_ref ?? null,
        };
      }),
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

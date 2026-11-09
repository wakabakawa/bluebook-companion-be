import { solveDp } from "./knapsack.js";
import { computePriorities, validateInput } from "./priorities.js";
import { Certificate, Params, PlanEntry, ScoredTopic, TopicStat } from "./types.js";

function emptyCertificate(status: "EMPTY_INPUT" | "BUDGET_TOO_SMALL", params: Params, excludedTopicIds: string[]): Certificate {
  return {
    status,
    objective: 0,
    budgetMin: params.budgetMin,
    totalCostMin: 0,
    qRequested: params.minStrong,
    qUsed: 0,
    plan: [],
    excludedTopicIds,
    metrics: { nTopics: 0, dpCells: 0, runtimeMs: 0 },
    warnings: status === "BUDGET_TOO_SMALL" ? ["no topic fits within the budget"] : [],
  };
}

function buildPlan(scored: ScoredTopic[], selectedIds: string[]): PlanEntry[] {
  const byId = new Map(scored.map((s) => [s.id, s]));
  const unranked = selectedIds.map((id) => {
    const t = byId.get(id);
    if (!t) throw new Error(`reconstruction produced unknown topic id: ${id}`);
    return t;
  });

  unranked.sort((a, b) => b.v / b.k - a.v / a.k || a.id.localeCompare(b.id));

  return unranked.map((t, i) => ({
    rank: i + 1,
    topicId: t.id,
    costMin: t.k,
    value: t.v,
    mastery: t.mu,
    weakness: t.w,
    staleness: t.r,
    strong: t.strong,
    reliable: t.reliable,
  }));
}

export function planReview(topics: TopicStat[], params: Params): Certificate {
  const start = performance.now();

  validateInput(topics, params);

  const { scored, excludedTopicIds } = computePriorities(topics, params);

  if (scored.length === 0) {
    return emptyCertificate("EMPTY_INPUT", params, excludedTopicIds);
  }
  if (scored.every((t) => t.k > params.budgetMin)) {
    return emptyCertificate("BUDGET_TOO_SMALL", params, excludedTopicIds);
  }

  const dp = solveDp(scored, params.budgetMin, params.minStrong);
  const plan = buildPlan(scored, dp.selectedIds);
  const totalCostMin = plan.reduce((sum, p) => sum + p.costMin, 0);

  const warnings: string[] = [];
  if (dp.qUsed < params.minStrong) {
    warnings.push(`requested minStrong=${params.minStrong} is infeasible; relaxed to q'=${dp.qUsed}`);
  }
  if (scored.some((t) => topics.find((orig) => orig.id === t.id)?.cohortMastery === null)) {
    warnings.push("cohort prior not released for one or more topics; using default prior");
  }

  return {
    status: dp.status,
    objective: dp.objective,
    budgetMin: params.budgetMin,
    totalCostMin,
    qRequested: params.minStrong,
    qUsed: dp.qUsed,
    plan,
    excludedTopicIds,
    metrics: {
      nTopics: scored.length,
      dpCells: dp.dpCells,
      runtimeMs: performance.now() - start,
    },
    warnings,
  };
}

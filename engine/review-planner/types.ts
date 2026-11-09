export interface TopicStat {
  id: string;
  N: number;
  a: number;
  c: number;
  daysSincePractice: number | null;
  cohortMastery: number | null;
  refSeconds: number;
}

export interface Params {
  budgetMin: number;
  minStrong: number;
  strongThreshold: number;
  minItems: number;
  priorStrength: number;
  defaultPrior: number;
  recencyWeight: number;
  halfLifeDays: number;
  reviewFactor: number;
}

export const DEFAULT_PARAMS: Params = {
  budgetMin: 120,
  minStrong: 1,
  strongThreshold: 0.8,
  minItems: 3,
  priorStrength: 2,
  defaultPrior: 0.5,
  recencyWeight: 0.5,
  halfLifeDays: 7,
  reviewFactor: 2.0,
};

export interface ScoredTopic {
  id: string;
  N: number;
  mu: number;
  w: number;
  r: number;
  reliable: boolean;
  strong: boolean;
  /** reliable && strong — the flag the DP's C2 constraint counts against q */
  s: boolean;
  k: number;
  v: number;
}

export type Status = "OPTIMAL" | "OPTIMAL_RELAXED_Q" | "BUDGET_TOO_SMALL" | "EMPTY_INPUT";

export interface PlanEntry {
  rank: number;
  topicId: string;
  costMin: number;
  value: number;
  mastery: number;
  weakness: number;
  staleness: number;
  strong: boolean;
  reliable: boolean;
}

export interface Metrics {
  nTopics: number;
  dpCells: number;
  runtimeMs: number;
}

export interface Certificate {
  status: Status;
  objective: number;
  budgetMin: number;
  totalCostMin: number;
  qRequested: number;
  qUsed: number;
  plan: PlanEntry[];
  excludedTopicIds: string[];
  metrics: Metrics;
  warnings: string[];
}

export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

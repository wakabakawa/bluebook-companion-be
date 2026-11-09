import { Params, TopicStat } from "../engine/review-planner/types.js";

// PDF §1.5: six topics from the 40-item sample set, all practiced one day ago,
// no cohort figure released, Average reference time (60s) used throughout.
export const WORKED_EXAMPLE_TOPICS: TopicStat[] = [
  { id: "Stoichiometry", N: 4, a: 4, c: 0, daysSincePractice: 1, cohortMastery: null, refSeconds: 60 },
  { id: "AcidsAndBases", N: 3, a: 3, c: 0, daysSincePractice: 1, cohortMastery: null, refSeconds: 60 },
  { id: "ErrorIdentification", N: 6, a: 6, c: 4, daysSincePractice: 1, cohortMastery: null, refSeconds: 60 },
  { id: "PoetryAnalysis", N: 3, a: 3, c: 2, daysSincePractice: 1, cohortMastery: null, refSeconds: 60 },
  { id: "Vocabulary", N: 4, a: 4, c: 3, daysSincePractice: 1, cohortMastery: null, refSeconds: 60 },
  { id: "TextAnalysisInference", N: 3, a: 3, c: 3, daysSincePractice: 1, cohortMastery: null, refSeconds: 60 },
];

export const WORKED_EXAMPLE_PARAMS_BASE: Omit<Params, "budgetMin" | "minStrong"> = {
  strongThreshold: 0.8,
  minItems: 3,
  priorStrength: 2,
  defaultPrior: 0.5,
  recencyWeight: 0.5,
  halfLifeDays: 7,
  reviewFactor: 2.0,
};

export const WORKED_EXAMPLE_EXPECTED = {
  q1: { objective: 8.327, totalCostMin: 28, selected: ["Stoichiometry", "AcidsAndBases", "Vocabulary", "TextAnalysisInference"] },
  q0: { objective: 8.927, totalCostMin: 28, selected: ["Stoichiometry", "AcidsAndBases", "PoetryAnalysis", "Vocabulary"] },
};

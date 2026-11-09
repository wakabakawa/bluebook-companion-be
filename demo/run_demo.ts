import { planReview } from "../engine/review-planner/service.js";
import { DEFAULT_PARAMS, InputError, TopicStat } from "../engine/review-planner/types.js";
import { WORKED_EXAMPLE_EXPECTED, WORKED_EXAMPLE_PARAMS_BASE, WORKED_EXAMPLE_TOPICS } from "./worked_example.js";

let failures = 0;

function check(label: string, pass: boolean): void {
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${label}`);
  if (!pass) failures++;
}

function runWorkedExample(q: number, expected: (typeof WORKED_EXAMPLE_EXPECTED)["q1"]): void {
  console.log(`\n=== Worked example (PDF §1.5), B=30, q=${q} ===`);
  const params = { ...WORKED_EXAMPLE_PARAMS_BASE, budgetMin: 30, minStrong: q };
  const cert = planReview(WORKED_EXAMPLE_TOPICS, params);

  console.table(
    cert.plan.map((p) => ({
      rank: p.rank,
      topic: p.topicId,
      cost_min: p.costMin,
      value: p.value.toFixed(3),
      mastery: p.mastery.toFixed(3),
      strong: p.strong,
    }))
  );
  console.log(`status=${cert.status} objective=${cert.objective.toFixed(3)} totalCostMin=${cert.totalCostMin}`);

  check(`objective ~= ${expected.objective}`, Math.abs(cert.objective - expected.objective) < 0.001);
  check(`totalCostMin = ${expected.totalCostMin}`, cert.totalCostMin === expected.totalCostMin);
  const selected = new Set(cert.plan.map((p) => p.topicId));
  check(
    `selected set = {${expected.selected.join(", ")}}`,
    selected.size === expected.selected.length && expected.selected.every((id) => selected.has(id))
  );
}

function runEdgeCases(): void {
  console.log("\n=== Edge cases (PDF §6.6) ===");

  const empty = planReview([], DEFAULT_PARAMS);
  check("empty topic list -> EMPTY_INPUT", empty.status === "EMPTY_INPUT");

  const zeroN: TopicStat[] = [
    { id: "no-items", N: 0, a: 0, c: 0, daysSincePractice: null, cohortMastery: null, refSeconds: 60 },
  ];
  const excluded = planReview(zeroN, DEFAULT_PARAMS);
  check("N=0 topic excluded, no crash", excluded.excludedTopicIds.includes("no-items"));

  const expensive: TopicStat[] = [
    { id: "too-expensive", N: 20, a: 20, c: 0, daysSincePractice: 1, cohortMastery: null, refSeconds: 600 },
  ];
  const tooSmall = planReview(expensive, { ...DEFAULT_PARAMS, budgetMin: 10 });
  check("every k_i > B -> BUDGET_TOO_SMALL", tooSmall.status === "BUDGET_TOO_SMALL");

  const onlyWeak: TopicStat[] = [
    { id: "weak", N: 4, a: 10, c: 0, daysSincePractice: 1, cohortMastery: null, refSeconds: 60 },
  ];
  const relaxed = planReview(onlyWeak, { ...DEFAULT_PARAMS, budgetMin: 60, minStrong: 1 });
  check("infeasible q relaxes to q'=0 with OPTIMAL_RELAXED_Q", relaxed.status === "OPTIMAL_RELAXED_Q" && relaxed.qUsed === 0);

  const coldStart: TopicStat[] = [
    { id: "cold", N: 4, a: 0, c: 0, daysSincePractice: null, cohortMastery: null, refSeconds: 60 },
  ];
  const cold = planReview(coldStart, { ...DEFAULT_PARAMS, budgetMin: 60, minStrong: 0 });
  const coldEntry = cold.plan.find((p) => p.topicId === "cold");
  check("cold-start topic marked reliable:false", coldEntry !== undefined && coldEntry.reliable === false);

  let threwInputError = false;
  try {
    planReview([{ id: "bad", N: 4, a: 4, c: 5, daysSincePractice: 1, cohortMastery: null, refSeconds: 60 }], DEFAULT_PARAMS);
  } catch (e) {
    threwInputError = e instanceof InputError;
  }
  check("malformed input (c > a) -> InputError", threwInputError);
}

runWorkedExample(1, WORKED_EXAMPLE_EXPECTED.q1);
runWorkedExample(0, WORKED_EXAMPLE_EXPECTED.q0);
runEdgeCases();

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);

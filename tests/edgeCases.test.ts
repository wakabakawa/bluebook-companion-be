import { describe, expect, it } from "vitest";
import { planReview } from "../engine/review-planner/service.js";
import { DEFAULT_PARAMS, InputError, TopicStat } from "../engine/review-planner/types.js";
import { paramsWith } from "./testUtils.js";

const topic = (overrides: Partial<TopicStat>): TopicStat => ({
  id: "T0",
  N: 4,
  a: 4,
  c: 2,
  daysSincePractice: 1,
  cohortMastery: null,
  refSeconds: 60,
  ...overrides,
});

describe("edge cases", () => {
  it("empty topic list -> EMPTY_INPUT", () => {
    const cert = planReview([], DEFAULT_PARAMS);
    expect(cert.status).toBe("EMPTY_INPUT");
    expect(cert.plan).toEqual([]);
  });

  it("topics with N=0 are excluded, not a division by zero", () => {
    const cert = planReview([topic({ id: "zero", N: 0 })], DEFAULT_PARAMS);
    expect(cert.status).toBe("EMPTY_INPUT");
    expect(cert.excludedTopicIds).toEqual(["zero"]);
  });

  it("every k_i > B -> BUDGET_TOO_SMALL", () => {
    const expensive = topic({ id: "big", N: 4, refSeconds: 600 });
    const cert = planReview([expensive], paramsWith({ budgetMin: 1 }));
    expect(cert.status).toBe("BUDGET_TOO_SMALL");
    expect(cert.plan).toEqual([]);
  });

  it("infeasible q relaxes to q' and reports it", () => {
    // Can never be "strong" (mastery far below threshold), so q=1 must relax to q'=0.
    const weakOnly = topic({ id: "weak", a: 10, c: 0 });
    const cert = planReview([weakOnly], paramsWith({ budgetMin: 60, minStrong: 1 }));
    expect(cert.status).toBe("OPTIMAL_RELAXED_Q");
    expect(cert.qUsed).toBe(0);
    expect(cert.warnings.some((w) => w.includes("relaxed"))).toBe(true);
  });

  it("cold start topic (a=0, never practiced) is marked unreliable", () => {
    const cold = topic({ id: "cold", a: 0, c: 0, daysSincePractice: null, cohortMastery: null });
    const cert = planReview([cold], paramsWith({ budgetMin: 60, minStrong: 0 }));
    const entry = cert.plan.find((p) => p.topicId === "cold");
    expect(entry).toBeDefined();
    expect(entry!.reliable).toBe(false);
    expect(entry!.staleness).toBe(1);
  });

  it("rejects out-of-range budget", () => {
    expect(() => planReview([topic({})], paramsWith({ budgetMin: 0 }))).toThrow(InputError);
    expect(() => planReview([topic({})], paramsWith({ budgetMin: 601 }))).toThrow(InputError);
  });

  it("rejects out-of-range minStrong", () => {
    expect(() => planReview([topic({})], paramsWith({ minStrong: -1 }))).toThrow(InputError);
    expect(() => planReview([topic({})], paramsWith({ minStrong: 6 }))).toThrow(InputError);
  });

  it("rejects duplicate topic ids", () => {
    expect(() => planReview([topic({ id: "dup" }), topic({ id: "dup" })], DEFAULT_PARAMS)).toThrow(InputError);
  });

  it("rejects c > a", () => {
    expect(() => planReview([topic({ a: 2, c: 3 })], DEFAULT_PARAMS)).toThrow(InputError);
  });

  it("rejects negative refSeconds", () => {
    expect(() => planReview([topic({ refSeconds: -1 })], DEFAULT_PARAMS)).toThrow(InputError);
  });

  it("rejects negative daysSincePractice", () => {
    expect(() => planReview([topic({ daysSincePractice: -5 })], DEFAULT_PARAMS)).toThrow(InputError);
  });

  it("rejects NaN refSeconds", () => {
    expect(() => planReview([topic({ refSeconds: NaN })], DEFAULT_PARAMS)).toThrow(InputError);
  });

  it("rejects out-of-range cohortMastery", () => {
    expect(() => planReview([topic({ cohortMastery: 1.5 })], DEFAULT_PARAMS)).toThrow(InputError);
    expect(() => planReview([topic({ cohortMastery: -0.1 })], DEFAULT_PARAMS)).toThrow(InputError);
  });

  it("output is deterministic for the same input", () => {
    const topics = [topic({ id: "a" }), topic({ id: "b", N: 3, refSeconds: 30 })];
    const c1 = planReview(topics, paramsWith({ budgetMin: 20 }));
    const c2 = planReview(topics, paramsWith({ budgetMin: 20 }));
    expect(c1.plan.map((p) => p.topicId)).toEqual(c2.plan.map((p) => p.topicId));
    expect(c1.objective).toBe(c2.objective);
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Options } from "ajv/dist/2020.js";
import { createRequire } from "node:module";
import { buildApp } from "../api/app.js";
import { solveResponseSchema } from "../api/schemas/solve-response.schema.js";
import type { SolveRequest, SolveResponse, WireTopic } from "../api/wire-types.js";
import { WORKED_EXAMPLE_TOPICS } from "../demo/worked_example.js";
import { TopicStat } from "../engine/review-planner/types.js";
import { mulberry32, randomTopics } from "./testUtils.js";

const require = createRequire(import.meta.url);
const Ajv2020: { new (opts?: Options): import("ajv/dist/2020.js").default } = require("ajv/dist/2020.js");
const responseValidator = new Ajv2020({ $data: true, strict: true }).compile(solveResponseSchema);

function expectValidResponse(body: unknown): void {
  const ok = responseValidator(body);
  if (!ok) {
    throw new Error(`response schema violation: ${JSON.stringify(responseValidator.errors)}`);
  }
}

function toWireTopic(t: TopicStat): WireTopic {
  return {
    topic_id: t.id,
    items_in_book: t.N,
    answered: t.a,
    correct: t.c,
    days_since_practice: t.daysSincePractice,
    cohort_mastery: t.cohortMastery,
    ref_time_sec: t.refSeconds,
    book_page_ref: null,
  };
}

const VALID_UUID_A = "6f1c2a7e-3b0d-4e58-9a51-0c7f6d2b9e11";
const VALID_UUID_B = "b3e1f0d2-8c4a-4f7e-a2d9-5e6c7b8a9f01";

function baseRequest(overrides: Partial<SolveRequest> = {}): SolveRequest {
  return {
    request_id: VALID_UUID_A,
    profile_id: VALID_UUID_B,
    edition_id: 1,
    params: { budget_min: 30, min_strong: 1 },
    topics: WORKED_EXAMPLE_TOPICS.map(toWireTopic),
    ...overrides,
  };
}

describe("POST /api/v1/algorithm/solve", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();
  });

  it("case 1: worked example, q=1, matches the PDF exactly", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/algorithm/solve", payload: baseRequest() });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    const body = JSON.parse(res.payload) as SolveResponse;
    expectValidResponse(body);

    expect(body.request_id).toBe(VALID_UUID_A);
    expect(body.status).toBe("OPTIMAL");
    expect(body.engine).toEqual({
      name: "review-plan-optimizer",
      version: "0.1.0",
      algorithm: "cardinality-constrained-01-knapsack-dp",
    });
    expect(body.certificate.exact).toBe(true);
    expect(body.certificate.objective).toBe(8.326601);
    expect(body.certificate.total_cost_min).toBe(28);
    expect(body.certificate.q_requested).toBe(1);
    expect(body.certificate.q_used).toBe(1);
    expect(body.certificate.strong_selected).toBe(1);
    expect(body.certificate.plan).toHaveLength(4);
    expect(body.certificate.plan[0]).toEqual({
      rank: 1,
      topic_id: "Stoichiometry",
      cost_min: 8,
      value: 3.521886,
      mastery: 0.166667,
      weakness: 0.833333,
      staleness: 0.094276,
      strong: false,
      reliable: true,
      book_page_ref: null,
    });
    expect(new Set(body.certificate.plan.map((p) => p.topic_id))).toEqual(
      new Set(["Stoichiometry", "AcidsAndBases", "Vocabulary", "TextAnalysisInference"])
    );
    expect(body.metrics.n_topics).toBe(6);
    expect(body.metrics.dp_cells).toBe(372);
    expect(body.warnings).toContain("cohort prior not released for one or more topics; using default prior");
  });

  it("case 2: worked example, q=0", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/algorithm/solve",
      payload: baseRequest({ params: { budget_min: 30, min_strong: 0 } }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as SolveResponse;
    expectValidResponse(body);

    expect(body.certificate.objective).toBe(8.926601);
    expect(body.certificate.total_cost_min).toBe(28);
    expect(new Set(body.certificate.plan.map((p) => p.topic_id))).toEqual(
      new Set(["Stoichiometry", "AcidsAndBases", "PoetryAnalysis", "Vocabulary"])
    );
  });

  it("case 3: optional params omitted default to the engine's DEFAULT_PARAMS", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/algorithm/solve", payload: baseRequest() });
    const body = JSON.parse(res.payload) as SolveResponse;
    expect(body.certificate.objective).toBe(8.326601);
  });

  it("case 4: optional param override changes the result", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/algorithm/solve",
      payload: baseRequest({ params: { budget_min: 30, min_strong: 1, strong_threshold: 0.1 } }),
    });
    const body = JSON.parse(res.payload) as SolveResponse;
    expectValidResponse(body);
    expect(body.certificate.plan.some((p) => p.strong)).toBe(true);
    expect(body.certificate.plan.filter((p) => p.strong).length).toBeGreaterThan(1);
  });

  it("case 5: empty topics -> EMPTY_INPUT", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/algorithm/solve", payload: baseRequest({ topics: [] }) });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as SolveResponse;
    expectValidResponse(body);
    expect(body.status).toBe("EMPTY_INPUT");
    expect(body.certificate.plan).toEqual([]);
    expect(body.certificate.objective).toBe(0);
    expect(body.metrics.n_topics).toBe(0);
  });

  it("case 6: all-zero items_in_book -> EMPTY_INPUT with the topic excluded", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/algorithm/solve",
      payload: baseRequest({ topics: [{ ...toWireTopic(WORKED_EXAMPLE_TOPICS[0]!), items_in_book: 0 }] }),
    });
    const body = JSON.parse(res.payload) as SolveResponse;
    expectValidResponse(body);
    expect(body.status).toBe("EMPTY_INPUT");
    expect(body.certificate.excluded_topic_ids).toContain("Stoichiometry");
  });

  it("case 7: every topic too expensive -> BUDGET_TOO_SMALL", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/algorithm/solve",
      payload: baseRequest({
        params: { budget_min: 10, min_strong: 0 },
        topics: [{ ...toWireTopic(WORKED_EXAMPLE_TOPICS[0]!), items_in_book: 20, ref_time_sec: 600 }],
      }),
    });
    const body = JSON.parse(res.payload) as SolveResponse;
    expectValidResponse(body);
    expect(body.status).toBe("BUDGET_TOO_SMALL");
    expect(body.warnings.length).toBeGreaterThan(0);
  });

  it("case 8: infeasible q relaxes to q' -> OPTIMAL_RELAXED_Q", async () => {
    const weakTopic: WireTopic = {
      topic_id: "weak",
      items_in_book: 4,
      answered: 10,
      correct: 0,
      days_since_practice: 1,
      cohort_mastery: null,
      ref_time_sec: 60,
      book_page_ref: null,
    };
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/algorithm/solve",
      payload: baseRequest({ params: { budget_min: 60, min_strong: 1 }, topics: [weakTopic] }),
    });
    const body = JSON.parse(res.payload) as SolveResponse;
    expectValidResponse(body);
    expect(body.status).toBe("OPTIMAL_RELAXED_Q");
    expect(body.certificate.q_requested).toBe(1);
    expect(body.certificate.q_used).toBe(0);
    expect(body.certificate.strong_selected).toBe(0);
    expect(body.warnings.some((w) => w.includes("relaxed"))).toBe(true);
  });

  it("case 9: book_page_ref round-trips on selected topics and defaults to null otherwise", async () => {
    const topics = WORKED_EXAMPLE_TOPICS.map(toWireTopic);
    topics[0]!.book_page_ref = 214; // Stoichiometry is selected in the q=1 plan
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/algorithm/solve",
      payload: baseRequest({ topics }),
    });
    const body = JSON.parse(res.payload) as SolveResponse;
    expectValidResponse(body);
    const stoich = body.certificate.plan.find((p) => p.topic_id === "Stoichiometry");
    expect(stoich?.book_page_ref).toBe(214);
    const others = body.certificate.plan.filter((p) => p.topic_id !== "Stoichiometry");
    expect(others.every((p) => p.book_page_ref === null)).toBe(true);
  });

  it("case 10: non-JSON body -> 400 problem+json", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/algorithm/solve",
      headers: { "content-type": "application/json" },
      payload: "not json at all",
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    const body = JSON.parse(res.payload);
    expect(body.type).toBe("urn:bluebook:problem:malformed-json");
    expect(body.status).toBe(400);
    expect(body.instance).toBe("/api/v1/algorithm/solve");
    expect(body.detail.length).toBeGreaterThan(0);
  });

  it("case 11: content-type with no registered parser -> 400 (collapsed to the same malformed-json problem)", async () => {
    // text/plain has a default parser too (passes through, fails as 422 instead) — use a type with none.
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/algorithm/solve",
      headers: { "content-type": "application/xml" },
      payload: "<hello/>",
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.type).toBe("urn:bluebook:problem:malformed-json");
  });

  it("case 12: unknown top-level field -> 422", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/algorithm/solve",
      payload: { ...baseRequest(), foo: 1 },
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.type).toBe("urn:bluebook:problem:validation-error");
    expect(body.detail).toContain("/foo");
  });

  it("case 13: unknown field inside a topic -> 422", async () => {
    const topics = WORKED_EXAMPLE_TOPICS.map(toWireTopic) as Array<WireTopic & { bogus?: number }>;
    topics[2]!.bogus = 1;
    const res = await app.inject({ method: "POST", url: "/api/v1/algorithm/solve", payload: baseRequest({ topics }) });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.detail).toContain("/topics/2/");
    expect(body.detail).toContain("bogus");
  });

  it.each([0, 601, -5, 30.5])("case 14: budget_min=%s out of range -> 422", async (budgetMin) => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/algorithm/solve",
      payload: baseRequest({ params: { budget_min: budgetMin, min_strong: 1 } }),
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.detail).toContain("/params/budget_min");
  });

  it.each([6, -1])("case 15: min_strong=%s out of range -> 422", async (minStrong) => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/algorithm/solve",
      payload: baseRequest({ params: { budget_min: 30, min_strong: minStrong } }),
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.detail).toContain("/params/min_strong");
  });

  it("case 16: more than 750 topics -> 422", async () => {
    const rng = mulberry32(1);
    const topics = randomTopics(rng, 751).map(toWireTopic);
    const res = await app.inject({ method: "POST", url: "/api/v1/algorithm/solve", payload: baseRequest({ topics }) });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.detail).toContain("/topics");
    expect(body.detail).toContain("750");
  });

  it("case 17: correct > answered -> 422", async () => {
    const topics = WORKED_EXAMPLE_TOPICS.map(toWireTopic);
    topics[0]!.answered = 4;
    topics[0]!.correct = 5;
    const res = await app.inject({ method: "POST", url: "/api/v1/algorithm/solve", payload: baseRequest({ topics }) });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.detail).toContain("/topics/0/correct");
  });

  it("case 18: duplicate topic_id -> 422 (via the engine's InputError, not schema)", async () => {
    const one = toWireTopic(WORKED_EXAMPLE_TOPICS[0]!);
    const dup = { ...one, topic_id: one.topic_id };
    const res = await app.inject({ method: "POST", url: "/api/v1/algorithm/solve", payload: baseRequest({ topics: [one, dup] }) });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.type).toBe("urn:bluebook:problem:validation-error");
    expect(body.detail).toContain(one.topic_id);
  });

  it("case 19: missing required fields -> 422, naming each", async () => {
    const missingTopics = { ...baseRequest() } as Partial<SolveRequest>;
    delete missingTopics.topics;
    let res = await app.inject({ method: "POST", url: "/api/v1/algorithm/solve", payload: missingTopics });
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.payload).detail).toContain("topics");

    res = await app.inject({
      method: "POST",
      url: "/api/v1/algorithm/solve",
      payload: baseRequest({ params: { budget_min: 30 } as never }),
    });
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.payload).detail).toContain("min_strong");

    const missingRequestId = { ...baseRequest() } as Partial<SolveRequest>;
    delete missingRequestId.request_id;
    res = await app.inject({ method: "POST", url: "/api/v1/algorithm/solve", payload: missingRequestId });
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.payload).detail).toContain("request_id");
  });

  it("case 20: malformed request_id -> 422", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/algorithm/solve",
      payload: baseRequest({ request_id: "not-a-uuid" }),
    });
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.payload).detail).toContain("/request_id");
  });

  it("case 21: unknown route / wrong method -> 404 problem+json", async () => {
    const res1 = await app.inject({ method: "GET", url: "/api/v1/algorithm/solve" });
    expect(res1.statusCode).toBe(404);
    expect(JSON.parse(res1.payload).type).toBe("urn:bluebook:problem:not-found");

    const res2 = await app.inject({ method: "POST", url: "/api/v1/nope" });
    expect(res2.statusCode).toBe(404);
  });

  it("case 23: worst-case sizing guard, 750 topics stays well under the 2s budget", async () => {
    const rng = mulberry32(99);
    const topics = randomTopics(rng, 750).map(toWireTopic);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/algorithm/solve",
      payload: baseRequest({ params: { budget_min: 600, min_strong: 5 }, topics }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as SolveResponse;
    expectValidResponse(body);
    expect(body.metrics.dp_cells).toBeLessThanOrEqual(2_704_500);
    expect(body.metrics.runtime_ms).toBeLessThan(500);
  });

  it("case 24: problem bodies carry no extra members", async () => {
    const res400 = await app.inject({
      method: "POST",
      url: "/api/v1/algorithm/solve",
      headers: { "content-type": "application/json" },
      payload: "not json",
    });
    expect(Object.keys(JSON.parse(res400.payload)).sort()).toEqual(["detail", "instance", "status", "title", "type"]);

    const res422 = await app.inject({
      method: "POST",
      url: "/api/v1/algorithm/solve",
      payload: baseRequest({ request_id: "not-a-uuid" }),
    });
    expect(Object.keys(JSON.parse(res422.payload)).sort()).toEqual(["detail", "instance", "status", "title", "type"]);
  });
});

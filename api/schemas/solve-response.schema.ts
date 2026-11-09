const UUID_PATTERN = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

export const solveResponseSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://bluebook.local/schemas/solve-response.json",
  title: "SolveResponse",
  type: "object",
  additionalProperties: false,
  required: ["request_id", "status", "engine", "certificate", "metrics", "warnings"],
  properties: {
    request_id: { type: "string", pattern: UUID_PATTERN },
    status: { type: "string", enum: ["OPTIMAL", "OPTIMAL_RELAXED_Q", "BUDGET_TOO_SMALL", "EMPTY_INPUT"] },
    engine: {
      type: "object",
      additionalProperties: false,
      required: ["name", "version", "algorithm"],
      properties: {
        name: { type: "string", const: "review-plan-optimizer" },
        version: { type: "string" },
        algorithm: { type: "string", const: "cardinality-constrained-01-knapsack-dp" },
      },
    },
    certificate: {
      type: "object",
      additionalProperties: false,
      required: ["exact", "objective", "budget_min", "total_cost_min", "q_requested", "q_used", "strong_selected", "plan", "excluded_topic_ids"],
      properties: {
        exact: { type: "boolean", const: true },
        objective: { type: "number", minimum: 0 },
        budget_min: { type: "integer", minimum: 1, maximum: 600 },
        total_cost_min: { type: "integer", minimum: 0, maximum: 600 },
        q_requested: { type: "integer", minimum: 0, maximum: 5 },
        q_used: { type: "integer", minimum: 0, maximum: 5 },
        strong_selected: { type: "integer", minimum: 0 },
        plan: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["rank", "topic_id", "cost_min", "value", "mastery", "weakness", "staleness", "strong", "reliable", "book_page_ref"],
            properties: {
              rank: { type: "integer", minimum: 1 },
              topic_id: { type: "string", minLength: 1, maxLength: 128 },
              cost_min: { type: "integer", minimum: 0 },
              value: { type: "number", minimum: 0 },
              mastery: { type: "number", minimum: 0, maximum: 1 },
              weakness: { type: "number", minimum: 0, maximum: 1 },
              staleness: { type: "number", minimum: 0, maximum: 1 },
              strong: { type: "boolean" },
              reliable: { type: "boolean" },
              book_page_ref: { type: ["integer", "null"] },
            },
          },
        },
        excluded_topic_ids: { type: "array", items: { type: "string", minLength: 1, maxLength: 128 } },
      },
    },
    metrics: {
      type: "object",
      additionalProperties: false,
      required: ["n_topics", "dp_cells", "runtime_ms"],
      properties: {
        n_topics: { type: "integer", minimum: 0 },
        dp_cells: { type: "integer", minimum: 0 },
        runtime_ms: { type: "number", minimum: 0 },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;

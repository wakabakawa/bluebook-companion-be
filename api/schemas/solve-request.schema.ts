const UUID_PATTERN = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

export const solveRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://bluebook.local/schemas/solve-request.json",
  title: "SolveRequest",
  type: "object",
  additionalProperties: false,
  required: ["request_id", "profile_id", "edition_id", "params", "topics"],
  properties: {
    request_id: { type: "string", pattern: UUID_PATTERN },
    profile_id: { type: "string", pattern: UUID_PATTERN },
    edition_id: { type: "integer", minimum: 1 },
    params: {
      type: "object",
      additionalProperties: false,
      required: ["budget_min", "min_strong"],
      properties: {
        budget_min: { type: "integer", minimum: 1, maximum: 600 },
        min_strong: { type: "integer", minimum: 0, maximum: 5 },
        strong_threshold: { type: "number", minimum: 0, maximum: 1 },
        min_items: { type: "integer", minimum: 0, maximum: 100 },
        prior_strength: { type: "number", minimum: 0, maximum: 100 },
        default_prior: { type: "number", minimum: 0, maximum: 1 },
        recency_weight: { type: "number", minimum: 0, maximum: 10 },
        half_life_days: { type: "number", exclusiveMinimum: 0, maximum: 365 },
        review_factor: { type: "number", exclusiveMinimum: 0, maximum: 10 },
      },
    },
    topics: {
      type: "array",
      minItems: 0,
      maxItems: 750,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["topic_id", "items_in_book", "answered", "correct", "days_since_practice", "cohort_mastery", "ref_time_sec"],
        properties: {
          // Opaque correlation key: no pattern, since real ids are composite
          // strings with spaces/punctuation (e.g. "Reading Comprehension|Passages|X").
          topic_id: { type: "string", minLength: 1, maxLength: 128 },
          items_in_book: { type: "integer", minimum: 0, maximum: 10000 },
          answered: { type: "integer", minimum: 0, maximum: 100000 },
          correct: { type: "integer", minimum: 0, maximum: { $data: "1/answered" } },
          days_since_practice: { type: ["integer", "null"], minimum: 0, maximum: 100000 },
          cohort_mastery: { type: ["number", "null"], minimum: 0, maximum: 1 },
          ref_time_sec: { type: "integer", exclusiveMinimum: 0, maximum: 3600 },
          book_page_ref: { type: ["integer", "null"] },
        },
      },
    },
  },
} as const;

export const ENGINE_META = {
  name: "review-plan-optimizer",
  version: "0.1.0",
  algorithm: "cardinality-constrained-01-knapsack-dp",
} as const;

// Lowered from the Fastify server's 2000ms: Supabase's own per-request CPU cap is 2s,
// so this check must win that race to ever produce the contracted 504 + problem body
// (the platform's own cap kills the isolate instead, with a non-problem+json response).
export const ENGINE_TIMEOUT_MS = 1500;

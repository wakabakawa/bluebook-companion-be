import { SolveRequest, WireParams } from "./wire-types.ts";

// Hand-rolled rather than Ajv: Ajv's validator compiler uses `new Function` for
// codegen, which is unverified under the Supabase Edge Runtime's sandbox. The request
// shrank to ~2-9 scalar fields once topics[]/profile_id were dropped (see wire-types.ts),
// so hand validation is genuinely simpler than standing up a schema compiler for it.
// Revisit if the request grows back toward the old ~11-leaf-property shape.

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export type ValidationResult = { ok: true; value: SolveRequest } | { ok: false; detail: string };

function numberInRange(v: unknown, lo: number, hi: number, inclusiveLo = true): v is number {
  return typeof v === "number" && Number.isFinite(v) && (inclusiveLo ? v >= lo : v > lo) && v <= hi;
}

const PARAM_BOUNDS: Record<keyof Omit<WireParams, "budget_min" | "min_strong">, [number, number, boolean]> = {
  strong_threshold: [0, 1, true],
  min_items: [1, 50, true],
  prior_strength: [0, 50, false],
  default_prior: [0, 1, true],
  recency_weight: [0, 5, true],
  half_life_days: [0, 365, false],
  review_factor: [0, 10, false],
};

export function validateSolveRequest(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, detail: "/ request body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  const allowedTop = new Set(["request_id", "edition_id", "params"]);
  for (const key of Object.keys(b)) {
    if (!allowedTop.has(key)) return { ok: false, detail: `/${key} must NOT have additional properties` };
  }

  if (typeof b.request_id !== "string" || !UUID_RE.test(b.request_id)) {
    return { ok: false, detail: "/request_id must be a UUID string" };
  }
  if (!Number.isInteger(b.edition_id) || (b.edition_id as number) < 1) {
    return { ok: false, detail: "/edition_id must be a positive integer" };
  }
  if (typeof b.params !== "object" || b.params === null || Array.isArray(b.params)) {
    return { ok: false, detail: "/params must be an object" };
  }

  const p = b.params as Record<string, unknown>;
  const allowedParams = new Set(["budget_min", "min_strong", ...Object.keys(PARAM_BOUNDS)]);
  for (const key of Object.keys(p)) {
    if (!allowedParams.has(key)) return { ok: false, detail: `/params/${key} must NOT have additional properties` };
  }

  if (!numberInRange(p.budget_min, 1, 600) || !Number.isInteger(p.budget_min)) {
    return { ok: false, detail: "/params/budget_min must be an integer between 1 and 600" };
  }
  if (!numberInRange(p.min_strong, 0, 5) || !Number.isInteger(p.min_strong)) {
    return { ok: false, detail: "/params/min_strong must be an integer between 0 and 5" };
  }

  for (const [key, [lo, hi, inclusiveLo]] of Object.entries(PARAM_BOUNDS)) {
    if (p[key] === undefined) continue;
    if (!numberInRange(p[key], lo, hi, inclusiveLo)) {
      return { ok: false, detail: `/params/${key} must be a number in range` };
    }
  }

  return {
    ok: true,
    value: {
      request_id: b.request_id,
      edition_id: b.edition_id as number,
      params: p as unknown as WireParams,
    },
  };
}

import type { FastifyReply } from "fastify";
import { InputError } from "../engine/review-planner/types.js";

export interface ProblemType {
  type: string;
  title: string;
  status: 400 | 404 | 422 | 500 | 504;
}

export const MALFORMED_JSON: ProblemType = { type: "urn:bluebook:problem:malformed-json", title: "Malformed JSON body", status: 400 };
export const VALIDATION_ERROR: ProblemType = { type: "urn:bluebook:problem:validation-error", title: "Request failed schema validation", status: 422 };
export const NOT_FOUND: ProblemType = { type: "urn:bluebook:problem:not-found", title: "Not Found", status: 404 };
export const ENGINE_TIMEOUT: ProblemType = { type: "urn:bluebook:problem:engine-timeout", title: "Engine did not answer in time", status: 504 };
export const INTERNAL_ERROR: ProblemType = { type: "about:blank", title: "Internal Server Error", status: 500 };

export function sendProblem(reply: FastifyReply, problem: ProblemType, detail: string, instance: string): FastifyReply {
  return reply
    .code(problem.status)
    .header("content-type", "application/problem+json")
    .send({ type: problem.type, title: problem.title, status: problem.status, detail, instance });
}

interface AjvLikeError {
  instancePath: string;
  message?: string;
  params?: Record<string, unknown>;
}

export function ajvErrorToDetail(errors: AjvLikeError[]): string {
  const e = errors[0];
  if (!e) return "request failed validation";
  const extra = (e.params?.additionalProperty as string | undefined) ?? (e.params?.missingProperty as string | undefined);
  const pointer = e.instancePath + (extra ? `/${extra}` : "");
  return `${pointer || "/"} ${e.message ?? "is invalid"}`;
}

const WIRE_FIELD_NAMES: Record<string, string> = {
  budgetMin: "budget_min",
  minStrong: "min_strong",
  refSeconds: "ref_time_sec",
  daysSincePractice: "days_since_practice",
  cohortMastery: "cohort_mastery",
};

/** Rewrites the engine's camelCase field names to their wire (snake_case) equivalents. */
export function inputErrorToDetail(err: InputError): string {
  let message = err.message;
  for (const [camel, wire] of Object.entries(WIRE_FIELD_NAMES)) {
    message = message.split(camel).join(wire);
  }
  return message;
}

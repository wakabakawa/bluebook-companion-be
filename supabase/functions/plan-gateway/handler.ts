import { planReview } from "../_shared/engine/service.js";
import { InputError } from "../_shared/engine/types.js";
import { ENGINE_TIMEOUT_MS } from "../_shared/gateway/engine-meta.ts";
import { toParams, toSolveResponse, toTopicStats } from "../_shared/gateway/mappers.ts";
import {
  ENGINE_TIMEOUT,
  INTERNAL_ERROR,
  MALFORMED_JSON,
  NOT_FOUND,
  problemResponse,
  SERVER_DATA_ERROR,
  UNAUTHORIZED,
  UPSTREAM_TIMEOUT,
  VALIDATION_ERROR,
} from "../_shared/gateway/problem.ts";
import { validateSolveRequest } from "../_shared/gateway/validate.ts";
import type { DbTopicRow } from "../_shared/gateway/wire-types.ts";

export interface HandlerDeps {
  /** Resolves the caller's identity and the rows v_topic_stats returns for them, after
   *  upserting their local_profile via ensure_profile() (see the migration's comment
   *  for why that upsert is necessary even for a read-only plan request). */
  fetchTopicRows(authHeader: string, editionId: number): Promise<DbTopicRow[]>;
  now(): number;
}

export function createHandler(deps: HandlerDeps) {
  return async function handle(req: Request): Promise<Response> {
    const instance = new URL(req.url).pathname;

    if (req.method !== "POST") {
      return problemResponse(NOT_FOUND, `no route for ${req.method} ${instance}`, instance);
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return problemResponse(UNAUTHORIZED, "missing Authorization header", instance);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return problemResponse(MALFORMED_JSON, "request body is not valid JSON", instance);
    }

    const validated = validateSolveRequest(body);
    if (!validated.ok) {
      return problemResponse(VALIDATION_ERROR, validated.detail, instance);
    }
    const { request_id, edition_id, params: wireParams } = validated.value;

    let rows: DbTopicRow[];
    try {
      rows = await Promise.race([
        deps.fetchTopicRows(authHeader, edition_id),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("upstream-timeout")), 3000)),
      ]);
    } catch (err) {
      if (err instanceof Error && err.message === "upstream-timeout") {
        return problemResponse(UPSTREAM_TIMEOUT, "database did not answer within 3s", instance);
      }
      if (err instanceof Error && err.message === "unauthorized") {
        return problemResponse(UNAUTHORIZED, "invalid or expired session", instance);
      }
      console.error(err);
      return problemResponse(INTERNAL_ERROR, "failed to read topic stats", instance);
    }

    const params = toParams(wireParams);
    const topics = toTopicStats(rows, deps.now());

    let cert;
    try {
      cert = planReview(topics, params);
    } catch (err) {
      if (err instanceof InputError) {
        // Reaching here means v_topic_stats returned data the engine rejects (e.g. a
        // duplicate topic_id, which is impossible by the view's own primary key) -
        // that's a server-side data fault, not a client input problem.
        console.error("engine rejected server-provided data:", err.message);
        return problemResponse(SERVER_DATA_ERROR, err.message, instance);
      }
      throw err;
    }

    if (cert.metrics.runtimeMs > ENGINE_TIMEOUT_MS) {
      return problemResponse(
        ENGINE_TIMEOUT,
        `engine exceeded the ${ENGINE_TIMEOUT_MS}ms budget (took ${cert.metrics.runtimeMs.toFixed(1)}ms)`,
        instance
      );
    }

    const response = toSolveResponse(request_id, cert, rows);
    return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
  };
}

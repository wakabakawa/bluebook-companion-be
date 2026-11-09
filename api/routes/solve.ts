import type { FastifyPluginAsync } from "fastify";
import { planReview } from "../../engine/review-planner/service.js";
import { ENGINE_TIMEOUT_MS } from "../engine-meta.js";
import { bookPageRefIndex, toParams, toSolveResponse, toTopicStats } from "../mappers.js";
import { ENGINE_TIMEOUT, sendProblem } from "../problem.js";
import { solveRequestSchema } from "../schemas/solve-request.schema.js";
import type { SolveRequest } from "../wire-types.js";

export const solveRoute: FastifyPluginAsync = async (app) => {
  app.post<{ Body: SolveRequest }>(
    "/api/v1/algorithm/solve",
    { schema: { body: solveRequestSchema } },
    async (request, reply) => {
      const body = request.body;
      const topics = toTopicStats(body.topics);
      const params = toParams(body.params);
      const cert = planReview(topics, params);

      if (cert.metrics.runtimeMs > ENGINE_TIMEOUT_MS) {
        return sendProblem(
          reply,
          ENGINE_TIMEOUT,
          `Engine exceeded the ${ENGINE_TIMEOUT_MS} ms budget (took ${cert.metrics.runtimeMs.toFixed(1)} ms)`,
          request.url
        );
      }

      const pageRefs = bookPageRefIndex(body.topics);
      return toSolveResponse(body.request_id, cert, pageRefs);
    }
  );
};

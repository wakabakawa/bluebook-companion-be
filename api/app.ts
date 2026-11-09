import Fastify, { FastifyError, FastifyInstance } from "fastify";
import { createRequire } from "node:module";
import type { Options } from "ajv/dist/2020.js";
import { InputError } from "../engine/review-planner/types.js";
import {
  ajvErrorToDetail,
  inputErrorToDetail,
  INTERNAL_ERROR,
  MALFORMED_JSON,
  NOT_FOUND,
  sendProblem,
  VALIDATION_ERROR,
} from "./problem.js";
import { solveRoute } from "./routes/solve.js";

// ajv/dist/2020.js's default export doesn't type-check under NodeNext; require + hand-type it instead.
const require = createRequire(import.meta.url);
const Ajv2020: { new (opts?: Options): import("ajv/dist/2020.js").default } = require("ajv/dist/2020.js");

const ajv = new Ajv2020({
  coerceTypes: false,
  removeAdditional: false,
  useDefaults: false,
  allErrors: false,
  $data: true,
  strict: true,
});

export function buildApp(opts: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? true });

  app.setValidatorCompiler(({ schema }) => ajv.compile(schema));

  app.setNotFoundHandler((request, reply) => {
    sendProblem(reply, NOT_FOUND, `no route for ${request.method} ${request.url}`, request.url);
  });

  app.setErrorHandler((err: FastifyError, request, reply) => {
    if (typeof err.code === "string" && err.code.startsWith("FST_ERR_CTP_")) {
      sendProblem(reply, MALFORMED_JSON, err.message, request.url);
      return;
    }
    if (err.validation) {
      sendProblem(reply, VALIDATION_ERROR, ajvErrorToDetail(err.validation), request.url);
      return;
    }
    if (err instanceof InputError) {
      sendProblem(reply, VALIDATION_ERROR, inputErrorToDetail(err), request.url);
      return;
    }
    request.log.error(err);
    sendProblem(reply, INTERNAL_ERROR, "An unexpected error occurred.", request.url);
  });

  app.register(solveRoute);

  return app;
}

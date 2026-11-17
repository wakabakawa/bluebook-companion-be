export interface ProblemType {
  type: string;
  title: string;
  status: 400 | 401 | 404 | 422 | 500 | 504;
}

export const MALFORMED_JSON: ProblemType = { type: "urn:bluebook:problem:malformed-json", title: "Malformed JSON body", status: 400 };
export const VALIDATION_ERROR: ProblemType = { type: "urn:bluebook:problem:validation-error", title: "Request failed validation", status: 422 };
export const UNAUTHORIZED: ProblemType = { type: "urn:bluebook:problem:unauthorized", title: "Unauthorized", status: 401 };
export const ENGINE_TIMEOUT: ProblemType = { type: "urn:bluebook:problem:engine-timeout", title: "Engine did not answer in time", status: 504 };
export const UPSTREAM_TIMEOUT: ProblemType = { type: "urn:bluebook:problem:upstream-timeout", title: "Database did not answer in time", status: 504 };
export const SERVER_DATA_ERROR: ProblemType = { type: "urn:bluebook:problem:engine-rejected-server-data", title: "Server data failed engine validation", status: 500 };
export const NOT_FOUND: ProblemType = { type: "urn:bluebook:problem:not-found", title: "Not Found", status: 404 };
export const INTERNAL_ERROR: ProblemType = { type: "about:blank", title: "Internal Server Error", status: 500 };

export function problemResponse(problem: ProblemType, detail: string, instance: string): Response {
  return new Response(
    JSON.stringify({ type: problem.type, title: problem.title, status: problem.status, detail, instance }),
    { status: problem.status, headers: { "content-type": "application/problem+json" } }
  );
}

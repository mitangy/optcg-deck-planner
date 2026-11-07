/** api-client mutations (packages/api-client/src, vitest): the HTTP core both apps share (refactor 2.1a, 2.1b). */
const file = "packages/api-client/src/request.ts";
module.exports = {
  cwd: "packages/api-client",
  runner: "vitest",
  mutations: [
    { id: "api-client-204-parsed", file, from: "      if (res.status === 204) return undefined as T;\n      const text = await res.text();\n      return (text ? JSON.parse(text) : undefined) as T;", to: "      return (await res.json()) as T;", kills: ["resolves a 204 with no body to undefined instead of parsing it", "resolves an empty 200 body to undefined"] },
    { id: "api-client-error-status-ignored", file, from: "      if (!res.ok) {", to: "      if (false as boolean) {", kills: ["throws an ApiError carrying the status and the FastAPI detail string as its message"] },
    { id: "api-client-detail-not-unwrapped", file, from: "detail = body.detail ?? body;", to: "detail = body;", kills: ["throws an ApiError carrying the status and the FastAPI detail string as its message"] },
    { id: "api-client-no-timeout", file, from: "    }, timeoutMs);", to: "    }, 2 ** 30);", kills: ["aborts a request that outlives its timeout and throws a timeout ApiError"] },
    { id: "api-client-timeout-not-labelled", file, from: "      if (timedOut) throw new ApiError(0, \"timeout\", \"The server took too long to respond. Try again.\", \"timeout\");\n", to: "", kills: ["aborts a request that outlives its timeout and throws a timeout ApiError"] },
    { id: "api-client-caller-abort-ignored", file, from: "      else outer.addEventListener(\"abort\", () => controller.abort(outer.reason), { once: true });", to: "", kills: ["surfaces a caller's abort as the original abort error, not a timeout"] },
    { id: "api-client-json-header-always", file, from: "    if (fetchInit.body) {", to: "    if (true as boolean) {", kills: ["sends cookies, and a JSON content type only when there is a body"] },
    // Refactor 2.1b: the shared core merges caller headers, takes `json`, and binds base URL and default budget per app.
    { id: "api-client-caller-headers-dropped", file, from: "const headers = headerRecord(fetchInit.headers);", to: "const headers: Record<string, string> = {};", kills: ["keeps the caller's headers and adds the JSON content type to them (refactor 2.1b)"] },
    { id: "api-client-json-not-stringified", file, from: "if (json !== undefined) fetchInit.body = JSON.stringify(json);", to: "", kills: ["keeps the caller's headers and adds the JSON content type to them (refactor 2.1b)"] },
    { id: "api-client-base-url-frozen", edits: [{ file, from: "  return async function request<T>(path: string, init?: RequestOptions): Promise<T> {", to: "  const frozen = baseUrl();\n  return async function request<T>(path: string, init?: RequestOptions): Promise<T> {" }, { file, from: "`${baseUrl()}${path}`", to: "`${frozen}${path}`" }], kills: ["prefixes the path with the base URL read at call time (refactor 2.1b)"] },
    { id: "api-client-default-timeout-ignored", file, from: "const { timeoutMs = defaultTimeoutMs,", to: "const { timeoutMs = 2 ** 30,", kills: ["uses the client's default timeout unless the call sets its own (refactor 2.1b)"] },
  ],
};

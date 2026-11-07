/**
 * The planner's one HTTP client: base URL, credentials, JSON headers, FastAPI `{detail}` error parsing, empty
 * bodies and a timeout. `api.ts` and `friends/friendsApi.ts` route every backend call through `request`.
 */
const configured = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "");
// Local: hit uvicorn directly, on whichever host the page itself was loaded
// from — not a fixed address. A static VITE_API_URL forces every page load to
// call that one host regardless of how it was reached: opening the app via a
// LAN IP for phone testing would leave a desktop tab on localhost silently
// calling out to the LAN IP too, an unnecessary cross-address request that
// has nothing to do with how that tab was opened. Deriving it from
// window.location means localhost pairs with localhost and a LAN IP pairs
// with itself, independent of whatever else is being tested.
// Production: same-origin /api (Vercel rewrite → Render) so the session
// cookie is first-party (required on mobile Safari).
export const API_URL =
  configured ||
  (import.meta.env.DEV
    ? // Guarded rather than assumed: this module is imported (transitively,
      // via other components) by tests running under Vitest's default Node
      // environment, where `window` does not exist.
      typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.hostname}:8000`
      : "http://localhost:8000"
    : "/api");

/** Where the API lives for this page (same-origin /api in production). */
export function getApiBaseUrl(): string {
  return API_URL;
}

/**
 * Default per-request budget. Generous on purpose: the API runs on a free-tier host whose cold start can take
 * most of a minute, and nothing was time-limited before this client existed. It only has to stop a request
 * hanging forever.
 */
export const DEFAULT_TIMEOUT_MS = 90_000;
/** For endpoints that do real server work (receipt matching, bulk imports, scan sample uploads). */
export const LONG_TIMEOUT_MS = 180_000;

/**
 * A failed API call. `message` is what players see: the FastAPI `detail` string, or its JSON when `detail` is
 * not a string (validation errors are lists), or the status text.
 */
export class ApiError extends Error {
  readonly status: number;
  /** The parsed `detail` of a FastAPI error body (any JSON), or the status text when there was none. */
  readonly detail: unknown;
  /** `detail.code` when the backend sent `{detail: {code}}`; "timeout" when the request ran out of time. */
  readonly code: string | undefined;

  constructor(status: number, detail: unknown, message?: string, code?: string) {
    super(message ?? (typeof detail === "string" ? detail : JSON.stringify(detail)));
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    const fromDetail = (detail as { code?: unknown } | null)?.code;
    this.code = code ?? (typeof fromDetail === "string" ? fromDetail : undefined);
  }
}

export type RequestOptions = RequestInit & {
  /** Abort and throw an `ApiError` (code "timeout") after this long. Defaults to DEFAULT_TIMEOUT_MS. */
  timeoutMs?: number;
  /** The fetch to call; tests inject one. */
  fetchImpl?: typeof fetch;
};

export async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch, ...fetchInit } = init ?? {};
  const headers: HeadersInit = {
    ...(fetchInit.headers || {}),
  };
  if (fetchInit.body) {
    (headers as Record<string, string>)["Content-Type"] = "application/json";
  }

  // One controller covers the whole exchange, body read included, and also follows a caller's own signal.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const outer = fetchInit.signal;
  if (outer) {
    if (outer.aborted) controller.abort(outer.reason);
    else outer.addEventListener("abort", () => controller.abort(outer.reason), { once: true });
  }

  try {
    const res = await fetchImpl(`${API_URL}${path}`, {
      credentials: "include",
      ...fetchInit,
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail: unknown = res.statusText;
      try {
        const body = await res.json();
        detail = body.detail ?? body;
      } catch {
        /* ignore */
      }
      throw new ApiError(res.status, detail);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  } catch (err) {
    if (timedOut) throw new ApiError(0, "timeout", "The server took too long to respond. Try again.", "timeout");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

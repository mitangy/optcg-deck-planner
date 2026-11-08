/**
 * The planner's one HTTP client: its base URL and timeout budgets bound onto the shared `@optcg/api-client` core
 * (credentials, JSON headers, FastAPI `{detail}` error parsing, empty bodies, timeout). `api.ts` and
 * `friends/friendsApi.ts` route every backend call through `request`.
 */
import { ApiError, createRequest } from "@optcg/api-client";
import type { RequestOptions } from "@optcg/api-client";

export { ApiError };
export type { RequestOptions };

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

export const request = createRequest({ baseUrl: getApiBaseUrl, defaultTimeoutMs: DEFAULT_TIMEOUT_MS });

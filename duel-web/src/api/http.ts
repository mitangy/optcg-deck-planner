import { ApiError, createRequest, type RequestOptions } from "@optcg/api-client";
import { getApiBaseUrl } from "../config";

export { ApiError };
export type { RequestOptions };

/**
 * Per-call budget. Generous because the API runs on a free-tier host with a cold start of up to a minute; it
 * only has to stop a call from hanging forever. Pass `timeoutMs` for a shorter one.
 */
export const DEFAULT_TIMEOUT_MS = 90_000;

export const request = createRequest({ baseUrl: getApiBaseUrl, defaultTimeoutMs: DEFAULT_TIMEOUT_MS });

export function apiCall<T>(path: string, init?: RequestOptions, fallback = "Request failed"): Promise<T> {
  return request<T>(path, { ...init, fallback });
}

export async function apiError(res: Response, fallback: string): Promise<ApiError> {
  let detail = fallback;
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string" && body.detail) detail = body.detail;
  } catch {
    /* non-JSON body */
  }
  return new ApiError(res.status, detail);
}

export function withTimeoutWording(e: unknown, timeoutMs: number): unknown {
  if (e instanceof ApiError && e.code === "timeout") return new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
  return e;
}

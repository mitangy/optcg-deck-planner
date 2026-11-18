export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;
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
  json?: unknown;
  fallback?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type CreateRequestConfig = {
  baseUrl: () => string;
  defaultTimeoutMs: number;
};

export type Request = <T>(path: string, init?: RequestOptions) => Promise<T>;

function headerRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (Array.isArray(headers) || (typeof Headers !== "undefined" && headers instanceof Headers)) {
    const out: Record<string, string> = {};
    new Headers(headers).forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  return { ...(headers as Record<string, string>) };
}

export function createRequest({ baseUrl, defaultTimeoutMs }: CreateRequestConfig): Request {
  return async function request<T>(path: string, init?: RequestOptions): Promise<T> {
    const { timeoutMs = defaultTimeoutMs, fetchImpl = fetch, json, fallback, ...fetchInit } = init ?? {};
    const headers = headerRecord(fetchInit.headers);
    if (json !== undefined) fetchInit.body = JSON.stringify(json);
    if (fetchInit.body) {
      const hasType = Object.keys(headers).some((k) => k.toLowerCase() === "content-type");
      if (!hasType) headers["Content-Type"] = "application/json";
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
      const res = await fetchImpl(`${baseUrl()}${path}`, {
        credentials: "include",
        ...fetchInit,
        headers,
        signal: controller.signal,
      });
      if (!res.ok) {
        let detail: unknown = res.statusText;
        let serverText = false;
        try {
          const body = await res.json();
          detail = body.detail ?? body;
          serverText = typeof body.detail === "string" && body.detail !== "";
        } catch {
          /* ignore */
        }
        throw new ApiError(res.status, detail, fallback === undefined || serverText ? undefined : `${fallback} (${res.status})`);
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
  };
}

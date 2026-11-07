import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, request } from "./apiClient";

const reply = (body: BodyInit | null, init?: ResponseInit) => vi.fn(async () => new Response(body, init));
const asFetch = (f: unknown) => f as typeof fetch;

describe("planner API client (refactor 2.1a)", () => {
  afterEach(() => vi.useRealTimers());

  it("resolves a 204 with no body to undefined instead of parsing it", async () => {
    const fetchImpl = reply(null, { status: 204 });
    await expect(request<void>("/price-alerts/3", { method: "DELETE", fetchImpl: asFetch(fetchImpl) })).resolves.toBeUndefined();
  });

  it("resolves an empty 200 body to undefined", async () => {
    const fetchImpl = reply("", { status: 200 });
    await expect(request<unknown>("/notifications/read", { method: "POST", fetchImpl: asFetch(fetchImpl) })).resolves.toBeUndefined();
  });

  it("returns the parsed JSON of a 200", async () => {
    const fetchImpl = reply(JSON.stringify({ ok: true }), { status: 200 });
    await expect(request<{ ok: boolean }>("/auth/logout", { fetchImpl: asFetch(fetchImpl) })).resolves.toEqual({ ok: true });
  });

  it("throws an ApiError carrying the status and the FastAPI detail string as its message", async () => {
    const fetchImpl = reply(JSON.stringify({ detail: "Deck not found" }), { status: 404 });
    const err = await request("/decks/9", { fetchImpl: asFetch(fetchImpl) }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, detail: "Deck not found", message: "Deck not found" });
  });

  it("shows a non-string detail as JSON and exposes its code", async () => {
    const detail = { code: "oversize", message: "Too many copies" };
    const fetchImpl = reply(JSON.stringify({ detail }), { status: 409 });
    const err = (await request("/decks/1/cards/OP01-001", { fetchImpl: asFetch(fetchImpl) }).catch((e: unknown) => e)) as ApiError;
    expect(err.detail).toEqual(detail);
    expect(err.code).toBe("oversize");
    expect(err.message).toBe(JSON.stringify(detail));
  });

  it("falls back to the status text when the error body is not JSON", async () => {
    const fetchImpl = reply("<html>bad gateway</html>", { status: 502, statusText: "Bad Gateway" });
    const err = (await request("/decks", { fetchImpl: asFetch(fetchImpl) }).catch((e: unknown) => e)) as ApiError;
    expect(err).toMatchObject({ status: 502, message: "Bad Gateway" });
  });

  it("sends cookies, and a JSON content type only when there is a body", async () => {
    const fetchImpl = reply("{}");
    await request("/decks", { method: "POST", body: "{}", fetchImpl: asFetch(fetchImpl) });
    await request("/decks", { fetchImpl: asFetch(fetchImpl) });
    const [post, get] = fetchImpl.mock.calls.map((c) => (c as unknown as [string, RequestInit])[1]);
    expect(post.credentials).toBe("include");
    expect(post.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(get.headers).not.toHaveProperty("Content-Type");
  });

  // Never resolves on its own; rejects the way real fetch does when its signal aborts.
  const hanging = () =>
    vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );

  it("aborts a request that outlives its timeout and throws a timeout ApiError", async () => {
    vi.useFakeTimers();
    const fetchImpl = hanging();
    const pending = request("/shopping", { timeoutMs: 1000, fetchImpl: asFetch(fetchImpl) }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1000);
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].signal?.aborted).toBe(true);
    const err = (await pending) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "timeout", status: 0 });
  });

  it("does not abort a request that finishes inside its timeout", async () => {
    vi.useFakeTimers();
    const fetchImpl = reply("{}");
    await request("/shopping", { timeoutMs: 1000, fetchImpl: asFetch(fetchImpl) });
    await vi.advanceTimersByTimeAsync(5000);
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal?.aborted).toBe(false);
  });

  it("surfaces a caller's abort as the original abort error, not a timeout", async () => {
    const caller = new AbortController();
    const fetchImpl = hanging();
    const pending = request("/shopping", { signal: caller.signal, fetchImpl: asFetch(fetchImpl) }).catch((e: unknown) => e);
    caller.abort();
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].signal?.aborted).toBe(true);
    const err = await pending;
    expect(err).not.toBeInstanceOf(ApiError);
    expect((err as Error).name).toBe("AbortError");
  });
});

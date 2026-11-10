import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiCall, withTimeoutWording } from "./http";

function stub(status: number, body: BodyInit | null, statusText = "") {
  const f = vi.fn(async () => new Response(body, { status, statusText }));
  vi.stubGlobal("fetch", f);
  return f;
}
const message = (p: Promise<unknown>) => p.catch((e: Error) => e.message);

afterEach(() => vi.unstubAllGlobals());

describe("duel-web API calls (refactor 2.1b)", () => {
  it("shows the server's own message when it sent one", async () => {
    stub(409, JSON.stringify({ detail: "That username is already taken." }));
    expect(await message(apiCall("/x", { method: "PATCH" }, "Could not save"))).toBe("That username is already taken.");
  });

  it("words a failure with no server message as the feature's fallback and the status", async () => {
    stub(500, "<html>boom</html>", "Internal Server Error");
    expect(await message(apiCall("/x", {}, "Could not load friends"))).toBe("Could not load friends (500)");
  });

  it("does not show a validation list or other non-text detail to players", async () => {
    stub(422, JSON.stringify({ detail: [{ msg: "field required" }] }));
    expect(await message(apiCall("/x", {}, "Could not send request"))).toBe("Could not send request (422)");
  });

  it("uses 'Request failed' when the feature gave no wording", async () => {
    stub(503, "");
    expect(await message(apiCall("/x"))).toBe("Request failed (503)");
  });

  it("throws an ApiError that carries the status", async () => {
    stub(404, JSON.stringify({ detail: "gone" }));
    const err = await apiCall("/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
  });

  it("sends the JSON given as `json`, with a JSON content type and the session cookie", async () => {
    const f = stub(200, "{}");
    await apiCall("/x", { method: "POST", json: { a: 1 } });
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.body).toBe('{"a":1}');
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(init.credentials).toBe("include");
  });

  it("gives a timed-out call the 'Request timed out after Ns' wording where a feature always used it", () => {
    const timeout = new ApiError(0, "timeout", "The server took too long to respond. Try again.", "timeout");
    expect((withTimeoutWording(timeout, 15_000) as Error).message).toBe("Request timed out after 15s");
    const other = new ApiError(500, "no");
    expect(withTimeoutWording(other, 15_000)).toBe(other);
  });

  it("times out a call that brings its own signal, and still stops when that signal aborts (#1224)", async () => {
    vi.useFakeTimers();
    try {
      let seen: AbortSignal | undefined;
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_url: string, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              seen = init?.signal ?? undefined;
              seen?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
            }),
        ),
      );
      const caller = new AbortController();
      const pending = apiCall("/x", { signal: caller.signal, timeoutMs: 1000 }).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(1000);
      expect(seen?.aborted).toBe(true);
      expect(caller.signal.aborted).toBe(false);
      expect(await pending).toMatchObject({ code: "timeout" });
    } finally {
      vi.useRealTimers();
    }
  });
});

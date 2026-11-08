import { afterEach, describe, expect, it, vi } from "vitest";
import { call as adminCall } from "../admin/adminApi";
import { call as friendsCall } from "../friends/friendsApi";
import { setAnalystSharing } from "../history/historyApi";
import { submitReport } from "../reports/reportApi";
import { call as tournamentCall } from "../tournaments/tournamentApi";
import { ApiError } from "./api";
import { deleteAccountCosmetic, putAccountSettings } from "./prefsApi";

type Seen = { headers: Headers; body: unknown };

function stubFetch(status = 200, answer: unknown = {}): Seen[] {
  const seen: Seen[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit = {}) => {
    seen.push({ headers: new Headers(init.headers), body: init.body });
    return new Response(status === 204 ? null : JSON.stringify(answer), { status });
  });
  return seen;
}

afterEach(() => vi.unstubAllGlobals());

const copies = [
  ["friends", friendsCall],
  ["tournaments", tournamentCall],
  ["admin", adminCall],
] as const;

describe.each(copies)("%s request helper keeps caller headers (refactor 0.6)", (_name, call) => {
  it("sends the caller's own header alongside the JSON content type", async () => {
    const seen = stubFetch();
    await call("/x", { method: "POST", body: "{}", headers: { "X-Trace": "abc" } });
    expect(seen[0]!.headers.get("X-Trace")).toBe("abc");
    expect(seen[0]!.headers.get("Content-Type")).toBe("application/json");
  });

  it("sends caller headers even when there is no body", async () => {
    const seen = stubFetch();
    await call("/x", { headers: { "X-Trace": "abc" } });
    expect(seen[0]!.headers.get("X-Trace")).toBe("abc");
  });
});

describe("history and prefs requests tell the server the body is JSON (refactor 0.6)", () => {
  it("history PUT carries a JSON content type", async () => {
    const seen = stubFetch(200, { share_matches: true });
    await setAnalystSharing(true);
    expect(seen[0]!.headers.get("Content-Type")).toBe("application/json");
  });

  it("prefs PUT carries a JSON content type", async () => {
    const seen = stubFetch();
    await putAccountSettings({ a: 1 });
    expect(seen[0]!.headers.get("Content-Type")).toBe("application/json");
  });

  it("prefs request survives a 204 reply instead of crashing on the empty body", async () => {
    stubFetch(204);
    await expect(deleteAccountCosmetic(3)).resolves.toBeUndefined();
  });
});

describe("submitReport failures are ApiErrors (refactor 0.6)", () => {
  it("throws an ApiError carrying the status and the friendly message", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 429 })) as unknown as typeof fetch;
    const err = await submitReport({ reason: "toxic", source: "match" }, fetchImpl).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(429);
    expect((err as ApiError).message).toMatch(/try again later/);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureAuth, getAuth, refreshAuth, resetAuthForTests } from "./session";

// The real fetchAuthMe runs here; only the network is stubbed.
const fetchMock = vi.fn();
const json = (status: number, body: unknown = null) => new Response(JSON.stringify(body), { status });
const miko = { id: 7, email: "miko@e2e.test", name: "Miko", username: "Miko" };

beforeEach(() => {
  resetAuthForTests();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("auth session over real /auth/me responses", () => {
  it("a 502 on re-check keeps a signed-in player signed in (#1119)", async () => {
    fetchMock.mockResolvedValueOnce(json(200, miko));
    await ensureAuth();
    expect(getAuth()).toMatchObject({ status: "ready", user: { id: 7 } });
    fetchMock.mockResolvedValueOnce(json(502, { detail: "bad gateway" }));
    await refreshAuth();
    expect(getAuth()).toMatchObject({ status: "ready", user: { id: 7 } });
  });

  it("a 502 on first load is not cached: the next ensureAuth asks again (#1119)", async () => {
    fetchMock.mockResolvedValueOnce(json(502));
    await ensureAuth();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce(json(200, miko));
    await ensureAuth();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getAuth()).toMatchObject({ status: "ready", user: { id: 7 } });
  });

  it("a 401 is a real signed-out answer and is cached (#1119)", async () => {
    fetchMock.mockResolvedValueOnce(json(401));
    await ensureAuth();
    expect(getAuth()).toMatchObject({ status: "signed-out", user: null });
    await ensureAuth();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

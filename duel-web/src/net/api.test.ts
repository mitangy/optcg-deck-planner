import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { awaitDuelServicesReady, hotseatGuestId, logoutSession, mintGuestGameToken } from "./api";

describe("hotseatGuestId", () => {
  it("appends seat suffix and stays within API guest_id bounds", () => {
    const a = hotseatGuestId("browserguestid001", "a");
    const b = hotseatGuestId("browserguestid001", "b");
    expect(a).toBe("browserguestid001-a");
    expect(b).toBe("browserguestid001-b");
    expect(a).toMatch(/^[a-zA-Z0-9_-]{8,64}$/);
    expect(b).toMatch(/^[a-zA-Z0-9_-]{8,64}$/);
  });

  it("pads short keys so the API accepts them", () => {
    const id = hotseatGuestId("ab", "a");
    expect(id.length).toBeGreaterThanOrEqual(8);
    expect(id).toMatch(/^[a-zA-Z0-9_-]{8,64}$/);
  });

  it("strips illegal characters", () => {
    const id = hotseatGuestId("user@host!", "a");
    expect(id).toMatch(/^[a-zA-Z0-9_-]{8,64}$/);
    expect(id.endsWith("-a")).toBe(true);
  });
});

const token = { token: "t", expires_at: 1, user_id: 1, email: "e", display_name: "d", rating: 1000, games_played: 0 };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("token mint retries (#1224)", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Runs a mint to its end, letting the backoff waits pass. */
  async function mint() {
    const result = mintGuestGameToken("browserguestid001").then(
      (t) => t,
      (e: Error) => e,
    );
    await vi.advanceTimersByTimeAsync(5000);
    return result;
  }

  it("retries a 503 whatever its message says, and returns the token that follows", async () => {
    fetchMock.mockResolvedValueOnce(reply(503, { detail: "Token mint failed (400): bad request" }));
    fetchMock.mockResolvedValueOnce(reply(200, token));
    expect(await mint()).toMatchObject({ token: "t" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up on a 400 at once even when its message talks about a 503", async () => {
    fetchMock.mockResolvedValue(reply(400, { detail: "upstream said 503, 502, 429" }));
    const err = await mint();
    expect(err).toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 and a lost connection, three tries in all", async () => {
    fetchMock.mockResolvedValueOnce(reply(429, { detail: "slow down" }));
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fetchMock.mockResolvedValueOnce(reply(502, {}));
    const err = (await mint()) as Error;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(err.message).toBe("Guest token mint failed: Token mint failed (502)");
  });

  it("words a refused mint with the server's sentence behind the status", async () => {
    fetchMock.mockResolvedValue(reply(401, { detail: "Token service down" }));
    expect(((await mint()) as Error).message).toBe("Guest token mint failed: Token mint failed (401): Token service down");
  });
});

describe("awaitDuelServicesReady (#1224)", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps polling a cold service until both /health answer", async () => {
    let calls = 0;
    fetchMock.mockImplementation(async () => new Response("", { status: ++calls <= 4 ? 503 : 200 }));
    const ready = awaitDuelServicesReady("https://api.test/", "https://gs.test/", 25000);
    await vi.advanceTimersByTimeAsync(10000);
    expect(await ready).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/health");
    expect(fetchMock).toHaveBeenCalledWith("https://gs.test/health");
  });

  it("gives up with false once the budget is spent", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const ready = awaitDuelServicesReady("https://api.test", "https://gs.test", 3000);
    await vi.advanceTimersByTimeAsync(10000);
    expect(await ready).toBe(false);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
  });
});

describe("logoutSession (#1224)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("leaves the signed-in state even when the API answers with an error", async () => {
    vi.stubGlobal("fetch", async () => reply(500, {}));
    await expect(logoutSession()).resolves.toBeUndefined();
  });

  it("still throws when the connection is lost", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(logoutSession()).rejects.toThrow("Failed to fetch");
  });
});

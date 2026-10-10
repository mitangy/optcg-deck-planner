import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activeMatchModeLabel,
  fetchActiveMatches,
  gameServerHttpUrl,
  pickOtherDeviceMatch,
  type ActiveMatch,
} from "./activeMatches";

afterEach(() => {
  vi.unstubAllGlobals();
});

const match = (over: Partial<ActiveMatch>): ActiveMatch => ({
  roomId: "room-a",
  seats: [0],
  practice: false,
  ranked: false,
  phase: "playing",
  ...over,
});

describe("fetchActiveMatches (#451)", () => {
  it("asks the game server's http origin with the game token as a Bearer header", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ matches: [{ roomId: "r1", seats: [1], practice: false, ranked: true, phase: "playing" }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchActiveMatches("wss://gs.example.com/", "tok-123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://gs.example.com/active-matches");
    expect(init.headers.Authorization).toBe("Bearer tok-123");
    expect(out).toEqual([{ roomId: "r1", seats: [1], practice: false, ranked: true, phase: "playing" }]);
  });

  it("is silent on failure: an error status or a thrown fetch yields no matches", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ matches: [{ roomId: "x", seats: [0] }] }) })));
    await expect(fetchActiveMatches("http://gs", "t")).resolves.toEqual([]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(fetchActiveMatches("http://gs", "t")).resolves.toEqual([]);
  });

  it("keeps http(s) urls as they are", () => {
    expect(gameServerHttpUrl("http://localhost:2567")).toBe("http://localhost:2567");
  });
});

describe("pickOtherDeviceMatch (#451)", () => {
  it("hides a match this tab's own resume blob already covers", () => {
    expect(pickOtherDeviceMatch([match({ roomId: "room-a" })], { roomId: "room-a" })).toBeNull();
  });

  it("offers a match the local blob does not cover, skipping the covered one", () => {
    const picked = pickOtherDeviceMatch(
      [match({ roomId: "room-a" }), match({ roomId: "room-b" })],
      { roomId: "room-a" },
    );
    expect(picked?.roomId).toBe("room-b");
  });

  it("never offers a finished match", () => {
    expect(pickOtherDeviceMatch([match({ phase: "finished" })], null)).toBeNull();
  });
});

describe("activeMatchModeLabel (#451)", () => {
  it("names practice, ranked and private rooms", () => {
    expect(activeMatchModeLabel({ practice: true, ranked: false })).toBe("practice");
    expect(activeMatchModeLabel({ practice: false, ranked: true })).toBe("ranked");
    expect(activeMatchModeLabel({ practice: false, ranked: false })).toBe("private room");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { gameServerUrlFor, roomServerUrl } from "./gameServer";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("gameServerUrlFor", () => {
  it("connects to the token's game_server_url instead of the build-time server, and falls back without one (#389)", () => {
    vi.stubEnv("VITE_GAME_SERVER_URL", "https://gs-build.example");
    expect(gameServerUrlFor({ game_server_url: "https://pool-b.example/" })).toBe("https://pool-b.example");
    expect(gameServerUrlFor({ game_server_url: null })).toBe("https://gs-build.example");
    expect(gameServerUrlFor({ game_server_url: "" })).toBe("https://gs-build.example");
    expect(gameServerUrlFor({})).toBe("https://gs-build.example");
  });
});

describe("roomServerUrl", () => {
  it("dials the server a friend's room lives on, not the pool the API names now (#682)", () => {
    expect(roomServerUrl("https://pool-new.example", "https://pool-old.example/")).toBe("https://pool-old.example");
    expect(roomServerUrl("https://pool-new.example", null)).toBe("https://pool-new.example");
    expect(roomServerUrl("https://pool-new.example", undefined)).toBe("https://pool-new.example");
  });

  it("ignores a hinted server that is not https, or carries credentials or a query (#682)", () => {
    const assigned = "https://pool-new.example";
    for (const hint of [
      "http://pool-old.example",
      "https://user:pw@pool-old.example",
      "https://pool-old.example?next=1",
      "ws://pool-old.example",
      "pool-old.example",
      "",
    ]) {
      expect(roomServerUrl(assigned, hint), hint).toBe(assigned);
    }
    expect(roomServerUrl(assigned, "http://localhost:2567")).toBe("http://localhost:2567");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { gameServerUrlFor } from "./gameServer";

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

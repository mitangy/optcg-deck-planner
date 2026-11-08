import { afterEach, describe, expect, it, vi } from "vitest";
import { spectateUrl } from "./clipboard";

afterEach(() => vi.unstubAllGlobals());

describe("spectate link", () => {
  it("points at /watch/<room id> on this origin with the id escaped (#346)", () => {
    vi.stubGlobal("window", { location: { origin: "https://duel.example" } });
    expect(spectateUrl("Ab-9 x/y")).toBe("https://duel.example/watch/Ab-9%20x%2Fy");
  });
});

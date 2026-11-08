import { describe, expect, it } from "vitest";
import { hideArtLabel } from "./HideArtItems";

describe("Hide art menu label (#812)", () => {
  it("names the player and flips between Hide and Show", () => {
    expect(hideArtLabel({ seat: 1, name: "Zoro", hidden: false })).toBe("Hide Zoro's art");
    expect(hideArtLabel({ seat: 1, name: "Zoro", hidden: true })).toBe("Show Zoro's art");
  });
  it("falls back to the opponent when the seat has no name", () => {
    expect(hideArtLabel({ seat: 1, name: null, hidden: false })).toBe("Hide opponent's art");
  });
});

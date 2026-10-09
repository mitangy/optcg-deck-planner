import { describe, expect, it } from "vitest";
import { pinnedYou } from "./bounties";

const me = (rank: number | null) => ({ rank, rating: 1488, name: "Miko", username: "MikoTheNavigator" });

describe("Top bounties", () => {
  it("pins a You row with your rank when you are outside the top five (#431)", () => {
    expect(pinnedYou(me(9), 5)).toEqual({ rank: 9, rating: 1488 });
  });

  it("pins nothing when you are on the board already, or the sixth place is the first one off it (#431)", () => {
    expect(pinnedYou(me(5), 5)).toBeNull();
    expect(pinnedYou(me(1), 5)).toBeNull();
    expect(pinnedYou(me(6), 5)).toEqual({ rank: 6, rating: 1488 });
  });

  it("pins nothing for someone with no ranked games or signed out (#431)", () => {
    expect(pinnedYou(me(null), 5)).toBeNull();
    expect(pinnedYou(null, 5)).toBeNull();
  });
});

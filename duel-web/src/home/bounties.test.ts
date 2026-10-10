import { describe, expect, it } from "vitest";
import { pinnedYou } from "./bounties";

const me = (rank: number | null, user_id = 7) => ({ user_id, rank, rating: 1488, name: "Miko", username: "MikoTheNavigator" });
const shown = (...ids: number[]) => ids;

describe("Top bounties", () => {
  it("pins a You row with your rank when you are outside the top five (#431)", () => {
    expect(pinnedYou(me(9), shown(1, 2, 3, 4, 5))).toEqual({ rank: 9, rating: 1488 });
  });

  it("pins nothing when you are on the board already, or the sixth place is the first one off it (#431)", () => {
    expect(pinnedYou(me(5, 5), shown(1, 2, 3, 4, 5))).toBeNull();
    expect(pinnedYou(me(1, 1), shown(1, 2, 3, 4, 5))).toBeNull();
    expect(pinnedYou(me(6), shown(1, 2, 3, 4, 5))).toEqual({ rank: 6, rating: 1488 });
  });

  it("pins nothing for someone with no ranked games or signed out (#431)", () => {
    expect(pinnedYou(me(null), shown(1, 2, 3, 4, 5))).toBeNull();
    expect(pinnedYou(null, shown(1, 2, 3, 4, 5))).toBeNull();
  });

  it("pins you when a tie shares rank 1 but your row is cut off the list (#466)", () => {
    // 101 players tied at 1016 all have rank 1; the board shows 100 of them and you are the 101st.
    const board = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(pinnedYou(me(1, 101), board)).toEqual({ rank: 1, rating: 1488 });
    // A tied player who is listed is not pinned a second time.
    expect(pinnedYou(me(1, 40), board)).toBeNull();
  });
});

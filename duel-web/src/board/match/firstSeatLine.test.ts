import { describe, expect, it } from "vitest";
import { firstSeatLine } from "./firstSeatLine";

describe("firstSeatLine", () => {
  it("calls the first game's order a coin flip for both seats (#549)", () => {
    expect(firstSeatLine({ youFirst: true, boardSeat: 0, pickedBy: null })).toBe("Coin flip: you go first.");
    expect(firstSeatLine({ youFirst: false, boardSeat: 1, pickedBy: null })).toBe("Coin flip: you go second.");
  });

  it("credits the rematch loser who chose, from either side of the table (#549)", () => {
    expect(firstSeatLine({ youFirst: false, boardSeat: 1, pickedBy: 1 })).toBe("You chose to go second.");
    expect(firstSeatLine({ youFirst: true, boardSeat: 0, pickedBy: 0 })).toBe("You chose to go first.");
    expect(firstSeatLine({ youFirst: true, boardSeat: 1, pickedBy: 0 })).toBe("Opponent chose: you go first.");
    expect(firstSeatLine({ youFirst: false, boardSeat: 0, pickedBy: 1, opponentName: "Bob" })).toBe(
      "Bob chose: you go second.",
    );
  });

  it("keeps the plain line when an older server does not say how (#549)", () => {
    expect(firstSeatLine({ youFirst: true, boardSeat: 0, pickedBy: undefined })).toBe("You go first.");
    expect(firstSeatLine({ youFirst: false, boardSeat: 0, pickedBy: undefined })).toBe("You go second.");
  });
});

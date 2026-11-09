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

  it("names the dice roll that decided a room's first game, and who chose (#1190)", () => {
    const dice = { roller: 0 as const, caller: 1 as const, call: "high" as const, roll: 5, winner: 1 as const };
    expect(firstSeatLine({ youFirst: false, boardSeat: 1, pickedBy: 1, dice })).toBe(
      "You won the dice roll (5, High) and chose to go second.",
    );
    expect(firstSeatLine({ youFirst: true, boardSeat: 0, pickedBy: 1, dice, opponentName: "Bob" })).toBe(
      "Bob won the dice roll (5, High): you go first.",
    );
    const low = { roller: 1 as const, caller: 0 as const, call: "low" as const, roll: 5, winner: 1 as const };
    expect(firstSeatLine({ youFirst: false, boardSeat: 0, pickedBy: 1, dice: low })).toBe(
      "Opponent won the dice roll (5, Low): you go second.",
    );
  });

  it("falls back to the coin flip and rematch lines when a game has no dice (#1190)", () => {
    expect(firstSeatLine({ youFirst: true, boardSeat: 0, pickedBy: null, dice: null })).toBe("Coin flip: you go first.");
    expect(firstSeatLine({ youFirst: true, boardSeat: 0, pickedBy: 0, dice: null })).toBe("You chose to go first.");
  });
});

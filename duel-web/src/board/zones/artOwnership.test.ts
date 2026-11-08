import { describe, expect, it } from "vitest";
import { artEditSeat } from "./artOwnership";

describe("who may change a card's art", () => {
  it("an opponent's card opened with no viewing seat (Recent plays, preview) offers no art change (#287)", () => {
    expect(artEditSeat({ ownerSeat: 1, matchSeat: 0 })).toBeNull();
  });

  it("in a match the match seat decides, not a viewing seat the opener filled with the owner (#287)", () => {
    expect(artEditSeat({ ownerSeat: 1, viewingSeat: 1, matchSeat: 0 })).toBeNull();
    expect(artEditSeat({ ownerSeat: 0, viewingSeat: 1, matchSeat: 0 })).toBe(0);
  });

  it("spectators can't change art on either player's cards (#287)", () => {
    expect(artEditSeat({ ownerSeat: 0, viewingSeat: 0, matchSeat: null })).toBeNull();
    expect(artEditSeat({ ownerSeat: 1, viewingSeat: 1, matchSeat: null })).toBeNull();
  });

  it("your own card keeps the art picker and writes your seat's prefs (#287)", () => {
    expect(artEditSeat({ ownerSeat: 1, matchSeat: 1 })).toBe(1);
    expect(artEditSeat({ ownerSeat: 0, viewingSeat: 0 })).toBe(0);
  });
});

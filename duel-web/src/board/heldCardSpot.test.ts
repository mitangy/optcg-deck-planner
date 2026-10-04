import { describe, expect, it } from "vitest";
import { heldCardSpot } from "./heldCardSpot";

const header = { left: 0, right: 375, top: 632, bottom: 660 };

describe("heldCardSpot", () => {
  it("holds the card 12px up from its slot when the hand header is clear of it (#282)", () => {
    const spot = heldCardSpot({ left: 240, top: 700, width: 60, height: 84 }, header);
    expect(spot).toEqual({ bottom: 784, gap: 8, lift: -12 });
  });

  it("keeps the card below the header and lifts the bubble over it, so Sort / Hide stay clear (#282)", () => {
    // The played card was raised, so its top sits above the header's bottom edge.
    const spot = heldCardSpot({ left: 240, top: 640, width: 60, height: 84 }, header);
    expect(spot).toEqual({ bottom: 660 + 84, gap: 28 + 8, lift: 0 });
  });

  it("leaves a card that does not sit under the header alone (#282)", () => {
    const side = { left: 295, right: 490, top: 860, bottom: 888 };
    const spot = heldCardSpot({ left: 600, top: 850, width: 80, height: 112 }, side);
    expect(spot).toEqual({ bottom: 962, gap: 8, lift: -12 });
  });
});

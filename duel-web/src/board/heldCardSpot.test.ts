import { describe, expect, it } from "vitest";
import { clampHeldBottom, heldCardSpot } from "./heldCardSpot";

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

describe("clampHeldBottom", () => {
  it("keeps the held card above the bottom of the screen when the hand was tucked (#595)", () => {
    // Slot bottom at 780 in a 700px viewport, card held 12px up: visible bottom must be 692.
    expect(clampHeldBottom(780, -12, 200, 700)).toBe(700 - 8 + 12);
  });

  it("keeps the bubble below the top of the screen (#595)", () => {
    // A stack 300 tall cannot sit with its bottom at 150 without leaving the top of the screen.
    expect(clampHeldBottom(150, -12, 300, 700)).toBe(8 + 300);
  });

  it("lets the top win when the stack is taller than the screen allows (#595)", () => {
    expect(clampHeldBottom(780, 0, 690, 700)).toBe(8 + 690);
  });
});

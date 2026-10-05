import { describe, expect, it } from "vitest";
import { handDropSlot, moveToSlot, reconcileHandOrder, type SlotRect } from "./handOrder";

const card = (cx: number, cy: number, w = 60, h = 84): SlotRect => ({
  left: cx - w / 2,
  right: cx + w / 2,
  top: cy - h / 2,
  bottom: cy + h / 2,
});

describe("hand reorder", () => {
  it("keeps a dragged order across hand updates, drops cards that left and adds new cards at the end (#PR)", () => {
    // Saved: c, a, b. Then b is played and d, e are drawn.
    expect(reconcileHandOrder(["c", "a", "b"], ["a", "c", "d", "e"])).toEqual(["c", "a", "d", "e"]);
  });

  it("moves the dragged card to the slot it was dropped in (#PR)", () => {
    expect(moveToSlot(["a", "b", "c", "d"], "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveToSlot(["a", "b", "c", "d"], "d", 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("finds the drop slot in a fanned hand from the pointer's x, though the arc moves card heights (#PR)", () => {
    // Fan arc: the middle cards sit higher than the outer ones.
    const fan = [card(100, 120), card(150, 108), card(200, 104), card(250, 108), card(300, 120)];
    expect(handDropSlot(fan, 225, 160)).toBe(3);
    expect(handDropSlot(fan, 80, 80)).toBe(0);
    expect(handDropSlot(fan, 320, 100)).toBe(5);
  });

  it("finds the drop slot in a wrapping grid hand by row, then x (#PR)", () => {
    const grid = [card(50, 50), card(150, 50), card(250, 50), card(50, 150), card(150, 150)];
    // Second row, between its two cards: after the whole first row and one card.
    expect(handDropSlot(grid, 100, 150)).toBe(4);
    // First row, between its first two cards.
    expect(handDropSlot(grid, 100, 40)).toBe(1);
  });
});

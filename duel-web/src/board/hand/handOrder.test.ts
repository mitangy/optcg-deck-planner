import { describe, expect, it } from "vitest";
import { followHandDrag, handDropSlot, moveToSlot, reconcileHandOrder, type SlotRect } from "./handOrder";

const card = (cx: number, cy: number, w = 60, h = 84): SlotRect => ({
  left: cx - w / 2,
  right: cx + w / 2,
  top: cy - h / 2,
  bottom: cy + h / 2,
});

describe("hand reorder", () => {
  it("keeps a dragged order across hand updates, drops cards that left and adds new cards at the end (#294)", () => {
    expect(reconcileHandOrder(["c", "a", "b"], ["a", "c", "d", "e"])).toEqual(["c", "a", "d", "e"]);
  });

  it("moves the dragged card to the slot it was dropped in (#294)", () => {
    expect(moveToSlot(["a", "b", "c", "d"], "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveToSlot(["a", "b", "c", "d"], "d", 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("finds the drop slot in a fanned hand from the pointer's x, though the arc moves card heights (#294)", () => {
    const fan = [card(100, 120), card(150, 108), card(200, 104), card(250, 108), card(300, 120)];
    expect(handDropSlot(fan, 225, 160)).toBe(3);
    expect(handDropSlot(fan, 80, 80)).toBe(0);
    expect(handDropSlot(fan, 320, 100)).toBe(5);
  });

  it("finds the drop slot in a wrapping grid hand by row, then x (#294)", () => {
    const grid = [card(50, 50), card(150, 50), card(250, 50), card(50, 150), card(150, 150)];
    expect(handDropSlot(grid, 100, 150)).toBe(4);
    expect(handDropSlot(grid, 100, 40)).toBe(1);
  });

  const walk = (measured: (number | null)[], oneWayOut: boolean) => {
    let left = false;
    return measured.map((m) => {
      const next = followHandDrag(left, m, oneWayOut);
      left = next.left;
      return next.slot;
    });
  };

  it("a card dragged out of a floating fan and back over it is not reordered, so the board under the fan takes it (#294)", () => {
    expect(walk([1, 1, null, 2, 2], true)).toEqual([1, 1, null, null, null]);
  });

  it("a docked hand still takes a card dragged out and back for a new spot (#294)", () => {
    expect(walk([1, null, 2], false)).toEqual([1, null, 2]);
  });
});

import { describe, expect, it } from "vitest";
import type { ChoiceRequestView } from "../net/protocol";
import { floatLookAnswer, moveId, nearestSlot, tapInOrder } from "./floatOrder";

function look(rest: "deck_top" | "deck_bottom" | "top_or_bottom"): Extract<ChoiceRequestView, { type: "look" }> {
  return {
    type: "look",
    options: ["a", "b", "c", "d"].map((id) => ({ id, defId: "ST01-003", zone: "deck" as const, ownerSeat: 0 as const, eligible: true })),
    minSelect: 0,
    maxSelect: 1,
    groups: [{ label: "Up to 1", max: 1, eligibleIds: ["a", "b", "c", "d"] }],
    rest,
    restLabel: "",
  };
}

describe("floating look answer", () => {
  it("puts the cards back in the dragged row order, without the taken card", () => {
    // Row was reordered from a,b,c,d; "b" is taken.
    expect(floatLookAnswer(look("deck_bottom"), ["d", "a", "b", "c"], ["b"], "top")).toEqual({
      selectedOptionIds: ["b"],
      orderedOptionIds: ["d", "a", "c"],
    });
  });

  it("top-or-bottom sends every remaining card to the chosen side together", () => {
    expect(floatLookAnswer(look("top_or_bottom"), ["c", "a", "b", "d"], ["a"], "bottom")).toEqual({
      selectedOptionIds: ["a"],
      orderedOptionIds: ["c", "b", "d"],
      topOptionIds: [],
    });
    expect(floatLookAnswer(look("top_or_bottom"), ["c", "a", "b", "d"], ["a"], "top").topOptionIds).toEqual(["c", "b", "d"]);
  });
});

describe("floating card order", () => {
  it("moves a card to a new slot", () => {
    expect(moveId(["a", "b", "c", "d"], "d", 1)).toEqual(["a", "d", "b", "c"]);
    expect(moveId(["a", "b", "c"], "a", 9)).toEqual(["b", "c", "a"]);
  });

  it("tapping a card gives it the next number and slides it into that slot", () => {
    const first = tapInOrder(["a", "b", "c"], [], "c");
    expect(first).toEqual({ order: ["c", "a", "b"], tapped: ["c"] });
    expect(tapInOrder(first.order, first.tapped, "b")).toEqual({ order: ["c", "b", "a"], tapped: ["c", "b"] });
  });

  it("tapping a numbered card again clears its number and leaves the row", () => {
    expect(tapInOrder(["c", "b", "a"], ["c", "b"], "c")).toEqual({ order: ["c", "b", "a"], tapped: ["b"] });
  });

  it("drops on the nearest slot, including the next row on phones", () => {
    const slots = [{ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 250, y: 50 }, { x: 100, y: 200 }];
    expect(nearestSlot(slots, 160, 70)).toBe(1);
    expect(nearestSlot(slots, 140, 190)).toBe(3);
  });
});

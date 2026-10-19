import { describe, expect, it } from "vitest";
import { HIDDEN_HAND_DEF, farHandWithReveals, revealedIdSet } from "./handReveal";

const A = { id: "o1", defId: "ST01-014" };
const B = { id: "o2", defId: "ST01-016" };

describe("far hand with revealed cards (#491)", () => {
  it("puts the revealed cards first and card-back placeholders after, one slot per hand card (#491)", () => {
    const hand = farHandWithReveals(5, [A, B])!;
    expect(hand.map((c) => c.defId)).toEqual([A.defId, B.defId, HIDDEN_HAND_DEF, HIDDEN_HAND_DEF, HIDDEN_HAND_DEF]);
    expect(new Set(hand.map((c) => c.id)).size).toBe(5);
  });

  it("leaves the usual card backs when nothing is revealed (#491)", () => {
    expect(farHandWithReveals(5, undefined)).toBeUndefined();
    expect(farHandWithReveals(5, [])).toBeUndefined();
  });

  it("caps the placeholders like the all-backs fan but never drops a revealed card (#491)", () => {
    expect(farHandWithReveals(14, [A])).toHaveLength(10);
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, defId: A.defId }));
    expect(farHandWithReveals(12, many)!.filter((c) => c.defId !== HIDDEN_HAND_DEF)).toHaveLength(12);
  });

  it("never shows more slots than the opponent holds cards (#491)", () => {
    expect(farHandWithReveals(2, [A, B, { id: "o3", defId: A.defId }])!.map((c) => c.id)).toEqual(["o1", "o2"]);
  });

  it("collects your own revealed ids (#491)", () => {
    expect(revealedIdSet([A, B]).has("o2")).toBe(true);
    expect(revealedIdSet([A, B]).has("o3")).toBe(false);
    expect(revealedIdSet(undefined).size).toBe(0);
  });
});

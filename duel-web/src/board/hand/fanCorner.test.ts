import { describe, expect, it } from "vitest";
import { cornerBounds, fanCornerFor } from "./fanCorner";

const base = { fan: true, spectatorFan: false, moved: false, cuts: {} };

describe("the hand in the corner of a shortened column (#633)", () => {
  it("uses the corner of a cut column and not otherwise (#633)", () => {
    expect(fanCornerFor(base)).toBe(null);
    expect(fanCornerFor({ ...base, cuts: { right: 0.28 } })).toEqual({ column: "right", cut: 0.28 });
    expect(fanCornerFor({ ...base, cuts: { left: 0.3 } })).toEqual({ column: "left", cut: 0.3 });
  });

  it("prefers the right column when both are cut (#633)", () => {
    expect(fanCornerFor({ ...base, cuts: { left: 0.4, right: 0.25 } })).toEqual({ column: "right", cut: 0.25 });
  });

  it("a moved fan, a spectator's fan and a hand that is not a fan keep their own places (#633)", () => {
    const cuts = { right: 0.28 };
    expect(fanCornerFor({ ...base, cuts, moved: true })).toBe(null);
    expect(fanCornerFor({ ...base, cuts, spectatorFan: true })).toBe(null);
    expect(fanCornerFor({ ...base, cuts, fan: false })).toBe(null);
  });

  it("spans from the mat's edge to the screen edge on the column's side (#633)", () => {
    const mat = { left: 3, right: 882 };
    expect(cornerBounds("right", mat, 1280)).toEqual({ left: 892, right: 0, width: 388 });
    expect(cornerBounds("left", { left: 400, right: 1200 }, 1280)).toEqual({ left: 0, right: 890, width: 390 });
  });
});

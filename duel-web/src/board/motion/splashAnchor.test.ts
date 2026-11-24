import { describe, expect, it } from "vitest";
import { splashAnchor, splashAnchorAboveMat } from "./splashAnchor";

describe("splashAnchor", () => {
  it("centres the turn banner on the opponent's mat, clear of the End turn dock (#281)", () => {
    expect(splashAnchor({ left: 331, top: 67, width: 720, height: 369 })).toEqual({ x: 691, y: 251.5 });
  });

  it("keeps the centred banner when the mat could not be measured (#281)", () => {
    expect(splashAnchor(null)).toBeNull();
    expect(splashAnchor({ left: 0, top: 0, width: 0, height: 0 })).toBeNull();
  });
});

describe("splashAnchorAboveMat", () => {
  it("puts the phone banner bottom edge on the line above the player mat, centred on it (#1343)", () => {
    const opp = { left: 12, top: 140, width: 726, height: 470 };
    const you = { left: 12, top: 668, width: 726, height: 468 };
    expect(splashAnchorAboveMat(opp, you)).toEqual({ x: 375, y: 668 });
  });

  it("gives up when a mat is missing or the player mat is not below the opponent mat (#1343)", () => {
    const box = { left: 0, top: 100, width: 300, height: 200 };
    expect(splashAnchorAboveMat(null, box)).toBeNull();
    expect(splashAnchorAboveMat(box, null)).toBeNull();
    expect(splashAnchorAboveMat(box, { ...box, top: 10 })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { splashAnchor } from "./splashAnchor";

describe("splashAnchor", () => {
  it("centres the turn banner on the opponent's mat, clear of the End turn dock (#281)", () => {
    expect(splashAnchor({ left: 331, top: 67, width: 720, height: 369 })).toEqual({ x: 691, y: 251.5 });
  });

  it("keeps the centred banner when the mat could not be measured (#281)", () => {
    expect(splashAnchor(null)).toBeNull();
    expect(splashAnchor({ left: 0, top: 0, width: 0, height: 0 })).toBeNull();
  });
});

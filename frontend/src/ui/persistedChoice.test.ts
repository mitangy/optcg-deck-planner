import { describe, expect, it } from "vitest";
import { showAltArtsFromStored } from "./cardListControls";

describe("showAltArtsFromStored", () => {
  it("shows alt arts when nothing is stored and hides them only after an explicit off (#625)", () => {
    expect(showAltArtsFromStored(null)).toBe(true);
    expect(showAltArtsFromStored("1")).toBe(true);
    expect(showAltArtsFromStored("0")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { COLOR_ORDER, parsePersistedChoice, showAltArtsFromStored } from "./cardListControls";

describe("parsePersistedChoice", () => {
  const allowed = ["", ...COLOR_ORDER];
  it("keeps a stored value that is still an option, including the empty All choice (#527)", () => {
    expect(parsePersistedChoice("Blue", "", allowed)).toBe("Blue");
    expect(parsePersistedChoice("", "Red", allowed)).toBe("");
  });
  it("falls back to the default for a stale value or nothing stored (#527)", () => {
    expect(parsePersistedChoice("Teal", "", allowed)).toBe("");
    expect(parsePersistedChoice(null, "Red", allowed)).toBe("Red");
  });
});

describe("showAltArtsFromStored", () => {
  it("shows alt arts when nothing is stored and hides them only after an explicit off (#625)", () => {
    expect(showAltArtsFromStored(null)).toBe(true);
    expect(showAltArtsFromStored("1")).toBe(true);
    expect(showAltArtsFromStored("0")).toBe(false);
  });
});

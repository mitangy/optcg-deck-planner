import { describe, expect, it } from "vitest";
import { COLOR_ORDER, parsePersistedChoice } from "./cardListControls";

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

import { describe, expect, it } from "vitest";
import { altChipLabel } from "../cards/AltTray";
import { defaultListDensity } from "./CardLayout";

describe("List density (#1342)", () => {
  it("long lists start Compact and deck and share pages start Comfortable (#1342)", () => {
    expect(defaultListDensity("shopping")).toBe("compact");
    expect(defaultListDensity("collection")).toBe("compact");
    expect(defaultListDensity("deck")).toBe("comfortable");
    expect(defaultListDensity("share")).toBe("comfortable");
  });

  it("the alt chip counts the alts and how many the user picked (#1342)", () => {
    expect(altChipLabel([{}, {}])).toBe("2 alts");
    expect(altChipLabel([{}])).toBe("1 alt");
    expect(altChipLabel([{ owned: 1 }, { wanted: 2 }, {}])).toBe("3 alts · 2 picked");
    expect(altChipLabel([{ collector: 1 }, {}])).toBe("2 alts · 1 picked");
  });
});

import { describe, expect, it } from "vitest";
import { hasActiveCardSearch } from "./searchAtlas";

describe("hasActiveCardSearch", () => {
  it("is false when only excludeLeaders is set (deck-config default)", () => {
    expect(hasActiveCardSearch({ excludeLeaders: true })).toBe(false);
    expect(hasActiveCardSearch({})).toBe(false);
  });

  it("is true for a non-empty query", () => {
    expect(hasActiveCardSearch({ query: "luffy" })).toBe(true);
    expect(hasActiveCardSearch({ query: "  " })).toBe(false);
  });

  it("is true when any filter chip or range is applied", () => {
    expect(hasActiveCardSearch({ colors: ["red"] })).toBe(true);
    expect(hasActiveCardSearch({ types: ["character"] })).toBe(true);
    expect(hasActiveCardSearch({ attributes: ["Strike"] })).toBe(true);
    expect(hasActiveCardSearch({ counterNone: true })).toBe(true);
    expect(hasActiveCardSearch({ counter: 1000 })).toBe(true);
    expect(hasActiveCardSearch({ costMin: 0 })).toBe(true);
    expect(hasActiveCardSearch({ costMax: 5 })).toBe(true);
    expect(hasActiveCardSearch({ powerMin: 5000 })).toBe(true);
    expect(hasActiveCardSearch({ powerMax: 9000 })).toBe(true);
    expect(hasActiveCardSearch({ blocker: true })).toBe(true);
    expect(hasActiveCardSearch({ rush: false })).toBe(true);
  });
});

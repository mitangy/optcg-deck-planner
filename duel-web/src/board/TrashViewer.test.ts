import { describe, expect, it } from "vitest";
import { trashNewestFirst } from "./TrashViewer";

describe("trashNewestFirst", () => {
  it("returns empty for empty trash", () => {
    expect(trashNewestFirst([])).toEqual([]);
  });

  it("shows newest (last pushed) first", () => {
    expect(trashNewestFirst(["ST01-003", "ST01-014", "ST01-009"])).toEqual([
      "ST01-009",
      "ST01-014",
      "ST01-003",
    ]);
  });

  it("does not mutate the input", () => {
    const src = ["A", "B"];
    const out = trashNewestFirst(src);
    expect(src).toEqual(["A", "B"]);
    expect(out).toEqual(["B", "A"]);
  });
});

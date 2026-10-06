import { afterEach, describe, expect, it, vi } from "vitest";
import { groupTrashByCard, readTrashSort, trashNewestFirst, writeTrashSort } from "./TrashViewer";

afterEach(() => vi.unstubAllGlobals());

describe("trashNewestFirst", () => {
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

describe("groupTrashByCard", () => {
  it("orders cards by copy count, not first appearance (#380)", () => {
    // newest-first: A once, B three times, C twice
    expect(groupTrashByCard(["A", "B", "C", "B", "C", "B"])).toEqual([
      { defId: "B", count: 3 },
      { defId: "C", count: 2 },
      { defId: "A", count: 1 },
    ]);
  });

  it("breaks count ties by most recently trashed (#380)", () => {
    // Z and Y both ×2; Y's newest copy (index 1) beats Z's (index 2). X ×1 last.
    expect(groupTrashByCard(["X", "Y", "Z", "Z", "Y"])).toEqual([
      { defId: "Y", count: 2 },
      { defId: "Z", count: 2 },
      { defId: "X", count: 1 },
    ]);
  });

  it("does not mutate the input (#380)", () => {
    const src = ["A", "B", "B"];
    groupTrashByCard(src);
    expect(src).toEqual(["A", "B", "B"]);
  });
});

describe("trash sort preference", () => {
  it("remembers By card and falls back to newest when storage throws (#380)", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    expect(readTrashSort()).toBe("newest");
    writeTrashSort("card");
    expect(store.get("duel.trashSort")).toBe("card");
    expect(readTrashSort()).toBe("card");
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readTrashSort()).toBe("newest");
    expect(() => writeTrashSort("card")).not.toThrow();
  });
});

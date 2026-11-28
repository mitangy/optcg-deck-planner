import { describe, expect, it } from "vitest";
import {
  computeDisplayedOrder,
  settleAnnouncement,
  settleAt,
  settleSummary,
  type HoldTiming,
} from "./settledOrder";

const ids = (...a: string[]) => a;
const set = (...a: string[]) => new Set(a);

describe("computeDisplayedOrder (#1498)", () => {
  it("a held row keeps its index after its sort key changes (#1498)", () => {
    // Count sort, most to buy first: "a" was on top, covering it would send it to the bottom.
    const shown = computeDisplayedOrder({
      prev: ids("a", "b", "c", "d"),
      target: ids("b", "c", "d", "a"),
      pinned: set("a"),
      live: set("a", "b", "c", "d"),
    });
    expect(shown).toEqual(["a", "b", "c", "d"]);
  });

  it("a held row that fails the filter is still shown, in place (#1498)", () => {
    const shown = computeDisplayedOrder({
      prev: ids("a", "b", "c"),
      target: ids("a", "c"),
      pinned: set("b"),
      live: set("a", "b", "c"),
    });
    expect(shown).toEqual(["a", "b", "c"]);
  });

  it("rows nobody is editing still follow the live order (#1498)", () => {
    const shown = computeDisplayedOrder({
      prev: ids("a", "b", "c", "d"),
      target: ids("d", "c", "b", "a"),
      pinned: set("a"),
      live: set("a", "b", "c", "d"),
    });
    expect(shown).toEqual(["a", "d", "c", "b"]);
  });

  it("a held row that no longer exists is dropped (#1498)", () => {
    const shown = computeDisplayedOrder({
      prev: ids("a", "b"),
      target: ids("b"),
      pinned: set("a"),
      live: set("b"),
    });
    expect(shown).toEqual(["b"]);
  });

  it("settling shows the target order (#1498)", () => {
    const shown = computeDisplayedOrder({
      prev: ids("a", "b", "c"),
      target: ids("c", "a"),
      pinned: set(),
      live: set("a", "b", "c"),
    });
    expect(shown).toEqual(["c", "a"]);
  });

  it("two held rows keep their own places (#1498)", () => {
    const shown = computeDisplayedOrder({
      prev: ids("a", "b", "c", "d"),
      target: ids("c", "d", "b", "a"),
      pinned: set("a", "b"),
      live: set("a", "b", "c", "d"),
    });
    expect(shown).toEqual(["a", "b", "c", "d"]);
  });
});

const hold = (over: Partial<HoldTiming> = {}): HoldTiming => ({
  lastInteraction: 1000,
  leftAt: 1000,
  pointerInside: false,
  focusInside: false,
  inputFocused: false,
  touch: false,
  bulk: false,
  ...over,
});

describe("settleAt (#1498)", () => {
  it("waits for every held row: the last one to let go decides (#1498)", () => {
    const early = hold({ leftAt: 1000 });
    const late = hold({ leftAt: 3000, lastInteraction: 3000 });
    expect(settleAt([early, late])).toBe(3600);
  });

  it("never settles while a row is engaged by the pointer, until the backstop (#1498)", () => {
    expect(settleAt([hold({ pointerInside: true })])).toBe(9000);
  });

  it("never settles while the Owned input has focus (#1498)", () => {
    expect(settleAt([hold({ inputFocused: true, pointerInside: true })])).toBe(Infinity);
  });

  it("touch lets go 2.5 s after the last tap (#1498)", () => {
    expect(settleAt([hold({ touch: true, pointerInside: true })])).toBe(3500);
  });

  it("bulk changes settle 1.2 s later (#1498)", () => {
    expect(settleAt([hold({ bulk: true })])).toBe(2200);
  });

  it("nothing held, nothing to settle (#1498)", () => {
    expect(settleAt([])).toBeNull();
  });
});

describe("settle announcement (#1498)", () => {
  it("one row jumping counts as one moved, not every row it passed (#1498)", () => {
    expect(settleSummary(ids("a", "b", "c", "d"), ids("b", "c", "d", "a"))).toEqual({ removed: 0, moved: 1 });
  });

  it("counts removed rows and says nothing when nothing changed (#1498)", () => {
    const s = settleSummary(ids("a", "b", "c"), ids("a", "c"));
    expect(s).toEqual({ removed: 1, moved: 0 });
    expect(settleAnnouncement(s)).toBe("List updated: 1 removed.");
    expect(settleAnnouncement(settleSummary(ids("a", "b"), ids("a", "b")))).toBe("");
    expect(settleAnnouncement({ removed: 2, moved: 3 })).toBe("List updated: 2 removed, 3 moved.");
  });
});

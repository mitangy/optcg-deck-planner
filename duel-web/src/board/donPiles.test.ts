import { describe, expect, it } from "vitest";
import { groupIntoPiles, movePile, MAX_DON_PILES } from "./donPiles";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `d${i + 1}`);

describe("DON!! piles (#381)", () => {
  it("right-click moves a chip from the main pile to a new second pile (#381)", () => {
    expect(movePile({}, ["d3"], ids(5))).toEqual({ d3: 1 });
  });

  it("right-click on a chip that shares a middle pile moves it on to the next pile (#381)", () => {
    expect(movePile({ d2: 1, d3: 1, d4: 2 }, ["d2"], ids(5))).toEqual({ d2: 2, d3: 1, d4: 2 });
  });

  it("a lone chip that is the whole of the last pile goes back to the main pile (#381)", () => {
    expect(movePile({ d3: 1 }, ["d3"], ids(5))).toEqual({});
  });

  it("the whole of the last pile goes back to main even when it holds several chips (#381)", () => {
    expect(movePile({ d2: 1, d3: 1 }, ["d2", "d3"], ids(5))).toEqual({});
  });

  it("a lone chip in a middle pile moves on and the emptied pile closes up (#381)", () => {
    expect(movePile({ d2: 1, d3: 2 }, ["d2"], ids(5))).toEqual({ d2: 1, d3: 1 });
  });

  it("piles stop at four: a chip in the fourth pile returns to main (#381)", () => {
    expect(movePile({ d2: 1, d3: 2, d4: 3, d5: 3 }, ["d4"], ids(6))).toEqual({ d2: 1, d3: 2, d5: 3 });
    // The fourth pile is reachable from the third.
    expect(movePile({ d2: 1, d3: 2, d4: 2 }, ["d3"], ids(6))).toEqual({ d2: 1, d3: 3, d4: 2 });
    expect(MAX_DON_PILES).toBe(4);
  });

  it("piles renumber without gaps when the main pile empties (#381)", () => {
    // d1 and d2 are all of the main pile; moving them leaves no main pile, so the rest shift down.
    expect(movePile({ d3: 1, d4: 1, d5: 2 }, ["d1", "d2"], ids(5))).toEqual({ d5: 1 });
  });

  it("selected chips from different piles all land in the pile after the clicked chip's (#381)", () => {
    // Clicked d4 is in pile 1, so d1 (pile 0) and d5 (pile 2) join it in pile 2, which is then the second pile.
    expect(movePile({ d4: 1, d5: 2 }, ["d4", "d1", "d5"], ids(5))).toEqual({ d1: 1, d4: 1, d5: 1 });
  });

  it("ids that are no longer in the cost area are dropped (#381)", () => {
    expect(movePile({ d9: 1, d3: 1 }, ["d1"], ids(5))).toEqual({ d1: 1, d3: 1 });
  });
});

describe("grouping DON!! into piles (#381)", () => {
  it("lists active before rested inside each pile and skips empty piles (#381)", () => {
    const tokens = [
      { id: "a", rested: true },
      { id: "b", rested: false },
      { id: "c", rested: true },
      { id: "d", rested: false },
    ];
    const groups = groupIntoPiles(tokens, { c: 2, d: 2 });
    expect(groups.map((g) => g.map((t) => t.id))).toEqual([["b", "a"], ["d", "c"]]);
  });
});

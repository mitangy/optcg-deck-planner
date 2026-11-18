import { describe, expect, it } from "vitest";
import { forYouItems } from "./forYouModel";

describe("For you strip (#1343)", () => {
  it("has no items, so no box, when there is no game and nothing live (#1343)", () => {
    expect(forYouItems({ lastMatch: null, liveMatches: null })).toEqual([]);
    expect(forYouItems({ lastMatch: null, liveMatches: 0 })).toEqual([]);
  });

  it("offers a review of the latest game that links to its match log (#1343)", () => {
    const [item] = forYouItems({ lastMatch: { id: "m 1", opponent: "Rival1", won: false }, liveMatches: 0 });
    expect(item).toMatchObject({ kind: "review", to: "/history/m%201", title: "Review your last game", blurb: "Lost vs Rival1" });
  });

  it("calls a game that never finished cut off, not won or lost (#1343)", () => {
    const [item] = forYouItems({ lastMatch: { id: "m1", opponent: "Rival1", won: true, finished: false }, liveMatches: null });
    expect(item.blurb).toBe("Cut off vs Rival1");
  });

  it("offers Spectate only while matches are live, with the count (#1343)", () => {
    expect(forYouItems({ lastMatch: null, liveMatches: 1 })).toEqual([{ kind: "spectate", title: "Spectate", blurb: "1 match live now" }]);
    expect(forYouItems({ lastMatch: null, liveMatches: 3 })[0].blurb).toBe("3 matches live now");
  });

  it("lists the review first, then Spectate (#1343)", () => {
    const kinds = forYouItems({ lastMatch: { id: "m1", opponent: "R", won: true }, liveMatches: 2 }).map((i) => i.kind);
    expect(kinds).toEqual(["review", "spectate"]);
  });
});

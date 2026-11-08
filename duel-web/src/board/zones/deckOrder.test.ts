import { describe, expect, it } from "vitest";
import { arrangementAnswer, groupAnswer, mergeArrangement, moveToRow, nudge, setSide, withoutIds } from "./deckOrder";

describe("deck put-back arrangement", () => {
  it("dragging a top card below the rest-of-deck row puts it on the bottom", () => {
    // Rows: a, b, [rest], c → drop a after the divider (index 2 among b, rest, c).
    expect(moveToRow({ top: ["a", "b"], bottom: ["c"] }, "a", 2)).toEqual({ top: ["b"], bottom: ["a", "c"] });
  });

  it("dragging within one side reorders it", () => {
    expect(moveToRow({ top: ["a", "b", "c"], bottom: [] }, "c", 0)).toEqual({ top: ["c", "a", "b"], bottom: [] });
  });

  it("the up arrow on the first bottom card moves it to the top side, next to the rest", () => {
    expect(nudge({ top: ["a"], bottom: ["b", "c"] }, "b", -1)).toEqual({ top: ["a", "b"], bottom: ["c"] });
  });

  it("Top / Bottom buttons place the card next to the rest of the deck", () => {
    expect(setSide({ top: ["a", "b"], bottom: ["c"] }, "a", "bottom")).toEqual({ top: ["b"], bottom: ["a", "c"] });
    expect(setSide({ top: ["a"], bottom: ["b", "c"] }, "c", "top")).toEqual({ top: ["a", "c"], bottom: ["b"] });
  });

  it("edits made while some cards are taken keep the taken cards for later", () => {
    const full = { top: ["a", "b", "c"], bottom: [] };
    const visible = withoutIds(full, ["b"]);
    const edited = moveToRow(visible, "c", 0);
    expect(mergeArrangement(full, edited, ["b"])).toEqual({ top: ["c", "a", "b"], bottom: [] });
  });

  it("answers with top cards first and only top cards as topOptionIds", () => {
    expect(arrangementAnswer({ top: ["b"], bottom: ["a", "c"] })).toEqual({ orderedOptionIds: ["b", "a", "c"], topOptionIds: ["b"] });
  });

  it("top-or-bottom answers keep every card on the same side", () => {
    expect(groupAnswer(["a", "b"], "top")).toEqual({ orderedOptionIds: ["a", "b"], topOptionIds: ["a", "b"] });
    expect(groupAnswer(["a", "b"], "bottom")).toEqual({ orderedOptionIds: ["a", "b"], topOptionIds: [] });
  });
});

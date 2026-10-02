import { describe, expect, it } from "vitest";
import { nextBoardFocusIndex, takesTab, type TabContext } from "./boardFocus";

describe("nextBoardFocusIndex", () => {
  it("steps through the cards and wraps at both ends (#257)", () => {
    expect(nextBoardFocusIndex(4, 1, false)).toBe(2);
    expect(nextBoardFocusIndex(4, 3, false)).toBe(0);
    expect(nextBoardFocusIndex(4, 1, true)).toBe(0);
    expect(nextBoardFocusIndex(4, 0, true)).toBe(3);
  });

  it("enters the board at the first card on Tab and the last on Shift+Tab from elsewhere (#257)", () => {
    expect(nextBoardFocusIndex(4, -1, false)).toBe(0);
    expect(nextBoardFocusIndex(4, -1, true)).toBe(3);
  });

  it("has nothing to focus on an empty board (#257)", () => {
    expect(nextBoardFocusIndex(0, -1, false)).toBeNull();
  });
});

describe("takesTab", () => {
  const ctx: TabContext = { typing: false, dialogOpen: false, inActions: false, over: false, cardCount: 3 };
  const tab = { key: "Tab" };

  it("takes Tab and Shift+Tab during a match (#257)", () => {
    expect(takesTab(tab, ctx)).toBe(true);
    expect(takesTab({ ...tab, shiftKey: true }, ctx)).toBe(true);
  });

  it("leaves Tab to the browser in text fields, dialogs and the card's own actions (#257)", () => {
    expect(takesTab(tab, { ...ctx, typing: true })).toBe(false);
    expect(takesTab(tab, { ...ctx, dialogOpen: true })).toBe(false);
    expect(takesTab(tab, { ...ctx, inActions: true })).toBe(false);
  });

  it("leaves Tab alone after the match, with no cards, or with a modifier (#257)", () => {
    expect(takesTab(tab, { ...ctx, over: true })).toBe(false);
    expect(takesTab(tab, { ...ctx, cardCount: 0 })).toBe(false);
    expect(takesTab({ ...tab, ctrlKey: true }, ctx)).toBe(false);
    expect(takesTab({ key: "Enter" }, ctx)).toBe(false);
  });
});

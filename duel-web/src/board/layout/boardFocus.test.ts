import { describe, expect, it } from "vitest";
import { nextTabTarget, takesTab, type TabContext } from "./boardFocus";

describe("nextTabTarget", () => {
  // Page order: Concede, opp card, your card, End turn, hand card, settings.
  const page = ["concede", "opp1", "you1", "endTurn", "hand1", "settings"];
  // Board order: field cards, then the hand.
  const ring = ["you1", "opp1", "hand1"];
  const next = (active: string | null, back = false) => nextTabTarget(page, ring, active, back);

  it("steps through the field cards, then the hand (#262)", () => {
    expect(next("you1")).toBe("opp1");
    expect(next("opp1")).toBe("hand1");
    expect(next("hand1", true)).toBe("opp1");
  });

  it("leaves the cards after the last one, and Shift+Tab before the first goes back out (#262)", () => {
    // The cards are one stop, where the first card ("you1") sits in the page.
    expect(next("hand1")).toBe("endTurn");
    expect(next("you1", true)).toBe("concede");
  });

  it("reaches every other control by Tab and comes back to the cards (#262)", () => {
    expect(next("endTurn")).toBe("settings");
    expect(next("settings")).toBe("concede");
    expect(next("concede")).toBe("you1");
    expect(next("endTurn", true)).toBe("hand1");
  });

  it("goes straight to the cards when nothing is focused (#262)", () => {
    expect(next(null)).toBe("you1");
    expect(next(null, true)).toBe("hand1");
  });

  it("has nothing to focus on an empty board (#262)", () => {
    expect(nextTabTarget(page, [], "concede", false)).toBeNull();
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

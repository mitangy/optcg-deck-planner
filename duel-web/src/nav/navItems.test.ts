import { describe, expect, it } from "vitest";
import { activeNavHref, NAV_ITEMS } from "./navItems";

describe("menu: which item is the current page (#460)", () => {
  it("marks Home only on the home page, not on every page (#460)", () => {
    expect(activeNavHref("/")).toBe("/");
    expect(activeNavHref("/settings")).toBe("/settings");
    expect(activeNavHref("/leaderboard")).toBe("/leaderboard");
    expect(activeNavHref("/whats-new")).toBe("/whats-new");
    expect(activeNavHref("/privacy")).not.toBe("/");
  });

  it("marks Meta decks, not Decks, on /decks/meta (#460)", () => {
    expect(activeNavHref("/decks/meta")).toBe("/decks/meta");
    expect(activeNavHref("/decks/meta/")).toBe("/decks/meta");
  });

  it("marks Decks on the list, new deck and a deck's configure page (#460)", () => {
    expect(activeNavHref("/decks")).toBe("/decks");
    expect(activeNavHref("/decks/new")).toBe("/decks");
    expect(activeNavHref("/decks/abc-123/configure")).toBe("/decks");
    // A deck whose id is "meta" is still a deck page, not the meta browser.
    expect(activeNavHref("/decks/meta/configure")).toBe("/decks");
  });

  it("marks Match history on the list and on one match log (#460)", () => {
    expect(activeNavHref("/history")).toBe("/history");
    expect(activeNavHref("/history/m42")).toBe("/history");
  });

  it("tolerates trailing slashes (#460)", () => {
    expect(activeNavHref("/history/")).toBe("/history");
    expect(activeNavHref("/decks//")).toBe("/decks");
    expect(activeNavHref("//")).toBe("/");
  });

  it("marks nothing on a page the menu does not list, and does not match by shared prefix (#460)", () => {
    expect(activeNavHref("/terms")).toBeNull();
    expect(activeNavHref("/duel")).toBeNull();
    expect(activeNavHref("/decksmith")).toBeNull();
    expect(activeNavHref("/settingsx")).toBeNull();
  });

  it("lists Home, Leaderboard, Decks, Meta decks, Match history, What's new, Settings in that order (#460)", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual(["/", "/leaderboard", "/decks", "/decks/meta", "/history", "/whats-new", "/settings"]);
  });
});

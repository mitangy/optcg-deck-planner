import { describe, expect, it } from "vitest";
import { activeNavHref, INLINE_NAV, isShownInline, NAV_ITEMS, navItemsFor } from "./navItems";

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

  it("lists Home, Leaderboard, Decks, Meta decks, Match history, Tournaments, What's new, Settings in that order (#460)", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual(["/", "/leaderboard", "/decks", "/decks/meta", "/profile", "/history", "/tournaments", "/whats-new", "/settings"]);
  });

  it("marks Tournaments on the list and on one tournament (#997)", () => {
    expect(activeNavHref("/tournaments")).toBe("/tournaments");
    expect(activeNavHref("/tournaments/AbC123")).toBe("/tournaments");
  });
});

describe("menu: Admin is for staff only (#667)", () => {
  it("adds Admin for the admin and moderators and for nobody else (#667)", () => {
    expect(navItemsFor("admin").map((i) => i.href)).toContain("/admin");
    expect(navItemsFor("moderator").map((i) => i.href)).toContain("/admin");
    expect(navItemsFor("user").map((i) => i.href)).not.toContain("/admin");
    expect(navItemsFor(null).map((i) => i.href)).not.toContain("/admin");
    expect(activeNavHref("/admin")).toBe("/admin");
  });
});

describe("wide top bar shows some menu entries inline (#1343)", () => {
  it("hides in the menu only what the bar already shows: Decks, Leaderboard, History, Tournaments and Settings (#1343)", () => {
    const hidden = NAV_ITEMS.filter((i) => isShownInline(i.href)).map((i) => i.href);
    expect(hidden).toEqual(["/leaderboard", "/decks", "/history", "/tournaments", "/settings"]);
  });

  it("every inline link is also a menu entry, so narrow screens still reach it (#1343)", () => {
    for (const item of INLINE_NAV) expect(NAV_ITEMS.map((i) => i.href)).toContain(item.href);
  });
});

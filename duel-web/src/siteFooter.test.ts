import { describe, expect, it } from "vitest";
import { compactSiteFooter, showsSiteFooter } from "./siteFooter";

describe("legal footer placement", () => {
  it("stays out of the way during a match (#245)", () => {
    for (const path of ["/duel", "/hotseat", "/demo"]) expect(showsSiteFooter(path)).toBe(false);
  });

  it("stays out of the way on a replay (#476)", () => {
    expect(showsSiteFooter("/replay/m1")).toBe(false);
    expect(showsSiteFooter("/history/m1")).toBe(true);
  });

  it("shows on the lobby, decks, settings and legal pages (#245)", () => {
    for (const path of ["/", "/decks", "/decks/abc/configure", "/settings", "/privacy"]) {
      expect(showsSiteFooter(path)).toBe(true);
    }
  });
});

describe("compact footer on app pages (#1343)", () => {
  it("keeps the full footer on the lobby, the public pages and the legal pages (#1343)", () => {
    for (const path of ["/", "/watch/r1", "/play-one-piece-tcg-online", "/optcg-sim-online", "/play-optcg-on-phone", "/leaders", "/leaders/luffy", "/terms", "/privacy", "/cookies", "/conduct"]) {
      expect(compactSiteFooter(path), path).toBe(false);
    }
  });

  it("uses the compact footer on the other app pages (#1343)", () => {
    for (const path of ["/decks", "/decks/new", "/decks/abc/configure", "/decks/meta", "/settings", "/history", "/history/m1", "/leaderboard", "/tournaments", "/tournaments/AbC", "/whats-new"]) {
      expect(compactSiteFooter(path), path).toBe(true);
    }
  });

  it("does not match by shared prefix (#1343)", () => {
    expect(compactSiteFooter("/leaderboard")).toBe(true);
    expect(compactSiteFooter("/termsx")).toBe(true);
  });
});

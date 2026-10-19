import { describe, expect, it } from "vitest";
import { showsSiteFooter } from "./siteFooter";

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

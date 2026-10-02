import { describe, expect, it } from "vitest";
import { showsSiteFooter } from "./siteFooter";

describe("legal footer placement", () => {
  it("stays out of the way during a match (#PR)", () => {
    for (const path of ["/duel", "/hotseat", "/demo"]) expect(showsSiteFooter(path)).toBe(false);
  });

  it("shows on the lobby, decks, settings and legal pages (#PR)", () => {
    for (const path of ["/", "/decks", "/decks/abc/configure", "/settings", "/privacy"]) {
      expect(showsSiteFooter(path)).toBe(true);
    }
  });
});

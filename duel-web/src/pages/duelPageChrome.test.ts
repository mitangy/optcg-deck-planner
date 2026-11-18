import { describe, expect, it } from "vitest";
import { duelPageChrome } from "./duelPageChrome";

describe("chat and Bounty strip by match type", () => {
  it("a bot game has neither chat nor the Bounty strip (#1343)", () => {
    expect(duelPageChrome({ vsBot: true, spectating: false, rating: 1184 })).toEqual({ bounty: false, chat: false });
  });

  it("a match against a person keeps chat and the Bounty strip (#1343)", () => {
    expect(duelPageChrome({ vsBot: false, spectating: false, rating: 1184 })).toEqual({ bounty: true, chat: true });
  });

  it("a spectator keeps chat but never sees a Bounty strip, and no rating means no strip (#1343)", () => {
    expect(duelPageChrome({ vsBot: false, spectating: true, rating: 1184 })).toEqual({ bounty: false, chat: true });
    expect(duelPageChrome({ vsBot: false, spectating: false, rating: null }).bounty).toBe(false);
  });
});

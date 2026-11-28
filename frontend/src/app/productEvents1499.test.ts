import { describe, expect, it } from "vitest";
import { cameFromDuel } from "./productEvents";

const DUEL = "https://optcgduel.app";

describe("planner visits that came from the duel app (#1499)", () => {
  it("the duel link's marker counts, whatever the referrer says (#1499)", () => {
    expect(cameFromDuel("?from=duel", "", DUEL)).toBe(true);
  });

  it("a referrer from the duel site counts when the marker was lost (#1499)", () => {
    expect(cameFromDuel("", "https://optcgduel.app/leaders/op01-001", DUEL)).toBe(true);
  });

  it("a visit from search, another site or a different marker value does not count (#1499)", () => {
    expect(cameFromDuel("", "https://www.google.com/", DUEL)).toBe(false);
    expect(cameFromDuel("?from=share", "", DUEL)).toBe(false);
    expect(cameFromDuel("", "https://optcgduel.app.evil.test/", DUEL)).toBe(false);
    expect(cameFromDuel("", "", DUEL)).toBe(false);
  });
});

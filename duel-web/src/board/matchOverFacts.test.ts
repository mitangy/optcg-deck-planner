import { describe, expect, it } from "vitest";
import type { MatchHistoryEntry } from "../history/historyApi";
import { matchOverFacts } from "./matchOverFacts";

const record = (over: Partial<MatchHistoryEntry> = {}): MatchHistoryEntry => ({
  match_id: "room-1",
  created_at: null,
  ranked: true,
  your_seat: 0,
  won: false,
  reason: "concede",
  turns: 9,
  your_leader_id: null,
  opponent_leader_id: null,
  opponent_name: "nami",
  rating_before: 1028,
  rating_after: 1012,
  has_replay: false,
  has_log: true,
  ...over,
});

describe("matchOverFacts", () => {
  it("shows the turn count before the saved match has landed (#281)", () => {
    expect(matchOverFacts(9, null)).toEqual({ turns: "Ended on turn 9", rating: null, logPath: null });
  });

  it("shows a ranked loss as a negative Bounty change and links the match log (#281)", () => {
    const facts = matchOverFacts(9, record());
    expect(facts.rating).toBe("Bounty 1028 → 1012 (−16)");
    expect(facts.logPath).toBe("/history/room-1");
  });

  it("shows a ranked win with a plus sign (#281)", () => {
    expect(matchOverFacts(5, record({ won: true, rating_before: 1000, rating_after: 1016 })).rating).toBe(
      "Bounty 1000 → 1016 (+16)",
    );
  });

  it("has no rating for an unranked game and no log link when the game has none (#281)", () => {
    const facts = matchOverFacts(4, record({ ranked: false, has_log: false }));
    expect(facts.rating).toBeNull();
    expect(facts.logPath).toBeNull();
  });
});

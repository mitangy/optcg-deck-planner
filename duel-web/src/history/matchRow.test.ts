import { describe, expect, it } from "vitest";
import type { MatchHistoryEntry } from "./historyApi";
import { matchRow } from "./matchRow";

const entry = (over: Partial<MatchHistoryEntry>): MatchHistoryEntry => ({
  match_id: "m1",
  created_at: "2026-10-02T10:00:00+00:00",
  ranked: true,
  your_seat: 1,
  won: true,
  reason: "leader_battle_at_zero_life",
  turns: 9,
  your_leader_id: "OP01-001",
  opponent_leader_id: "OP05-060",
  opponent_name: "Nami",
  rating_before: 1000,
  rating_after: 1016,
  has_replay: true,
  ...over,
});
const names: Record<string, string> = { "OP01-001": "Roronoa Zoro", "OP05-060": "Monkey.D.Luffy" };
const cardName = (id: string) => names[id] ?? id;
const now = new Date("2026-10-02T12:00:00Z");

describe("match history rows", () => {
  it("says who conceded, left or took the last hit from your side (#244)", () => {
    expect(matchRow(entry({ won: false, reason: "concede" }), cardName, now).how).toBe("You conceded");
    expect(matchRow(entry({ won: true, reason: "concede" }), cardName, now).how).toBe("Opponent conceded");
    expect(matchRow(entry({ won: true, reason: "abandoned" }), cardName, now).how).toBe("Opponent left the game");
    expect(matchRow(entry({ won: false, reason: "leader_battle_at_zero_life" }), cardName, now).how).toBe("You took the last hit");
    expect(matchRow(entry({ won: true, reason: "card_effect" }), cardName, now).how).toBe("Card effect");
    expect(matchRow(entry({ won: false }), cardName, now).outcome).toBe("Lost");
  });

  it("puts your leader first and names both (#244)", () => {
    const row = matchRow(entry({}), cardName, now);
    expect([row.yourLeader, row.opponentLeader]).toEqual(["Roronoa Zoro", "Monkey.D.Luffy"]);
  });

  it("shows the Bounty change with its sign, and none for unranked games (#244)", () => {
    expect(matchRow(entry({ rating_before: 1000, rating_after: 1016 }), cardName, now).bountyDelta).toBe("+16");
    expect(matchRow(entry({ rating_before: 1000, rating_after: 988 }), cardName, now).bountyDelta).toBe("−12");
    expect(matchRow(entry({ ranked: false, rating_after: 1000 }), cardName, now).bountyDelta).toBeNull();
  });

  it("dates recent games relative to now (#244)", () => {
    expect(matchRow(entry({ created_at: "2026-10-02T11:15:00Z" }), cardName, now).when).toBe("45m ago");
    expect(matchRow(entry({ created_at: "2026-10-02T09:00:00Z" }), cardName, now).when).toBe("3h ago");
    expect(matchRow(entry({ created_at: "2026-09-29T12:00:00Z" }), cardName, now).when).toBe("3d ago");
  });
});

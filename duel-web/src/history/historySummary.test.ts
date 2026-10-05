import { describe, expect, it } from "vitest";
import type { MatchHistoryEntry } from "./historyApi";
import { historySummary } from "./historySummary";

const entry = (over: Partial<MatchHistoryEntry>): MatchHistoryEntry => ({
  match_id: "m",
  created_at: "2026-10-02T10:00:00Z",
  ranked: true,
  your_seat: 0,
  won: true,
  reason: "concede",
  turns: 8,
  your_leader_id: "OP01-001",
  opponent_leader_id: "OP05-060",
  opponent_name: "Nami",
  rating_before: 1000,
  rating_after: 1016,
  has_replay: false,
  ...over,
});

describe("historySummary", () => {
  it("counts wins and losses over every listed game, ranked or not (#282)", () => {
    const s = historySummary([entry({}), entry({ won: false }), entry({ won: false, ranked: false }), entry({})]);
    expect(s).toMatchObject({ wins: 2, losses: 2 });
  });

  it("leaves unfinished games out of the record and the Bounty (#316)", () => {
    const s = historySummary([
      entry({ created_at: "2026-10-01T10:00:00Z", won: false, rating_after: 990 }),
      entry({ created_at: "2026-10-02T10:00:00Z", finished: false, won: false, rating_after: 0 }),
    ]);
    expect(s).toEqual({ wins: 0, losses: 1, rating: 990 });
    expect(historySummary([entry({ finished: false, won: false })])).toBeNull();
  });

  it("takes the Bounty from the newest ranked game whatever order the list is in (#282)", () => {
    const s = historySummary([
      entry({ created_at: "2026-10-01T10:00:00Z", rating_after: 1000 }),
      entry({ created_at: "2026-10-03T10:00:00Z", rating_after: 1042 }),
      entry({ created_at: "2026-10-02T10:00:00Z", rating_after: 1020 }),
      // A later unranked game leaves the Bounty as it was.
      entry({ created_at: "2026-10-04T10:00:00Z", ranked: false, rating_after: 5 }),
    ]);
    expect(s?.rating).toBe(1042);
  });

  it("has no Bounty before a ranked game, and no summary before any game (#282)", () => {
    expect(historySummary([entry({ ranked: false })])?.rating).toBeNull();
    expect(historySummary([])).toBeNull();
  });
});

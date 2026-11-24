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
    expect(s).toMatchObject({ wins: 0, losses: 1, rating: 990 });
    expect(historySummary([entry({ finished: false, won: false })])).toBeNull();
  });

  it("takes the Bounty from the newest ranked game whatever order the list is in (#282)", () => {
    const s = historySummary([
      entry({ created_at: "2026-10-01T10:00:00Z", rating_after: 1000 }),
      entry({ created_at: "2026-10-03T10:00:00Z", rating_after: 1042 }),
      entry({ created_at: "2026-10-02T10:00:00Z", rating_after: 1020 }),
      entry({ created_at: "2026-10-04T10:00:00Z", ranked: false, rating_after: 5 }),
    ]);
    expect(s?.rating).toBe(1042);
  });

  it("has no Bounty before a ranked game, and no summary before any game (#282)", () => {
    expect(historySummary([entry({ ranked: false })])?.rating).toBeNull();
    expect(historySummary([])).toBeNull();
  });

  it("splits the record into ranked and casual, and gives the win percent (#1388)", () => {
    const s = historySummary([
      entry({ ranked: true, won: true }),
      entry({ ranked: true, won: true }),
      entry({ ranked: true, won: false }),
      entry({ ranked: false, won: false }),
    ]);
    expect(s).toMatchObject({ games: 4, ranked: { wins: 2, losses: 1 }, casual: { wins: 0, losses: 1 }, winPct: 50 });
    expect(historySummary([entry({}), entry({}), entry({ won: false })])?.winPct).toBe(67);
  });

  it("counts the current streak from the newest finished game, skipping cut-off ones (#1388)", () => {
    const s = historySummary([
      entry({ created_at: "2026-10-01T10:00:00Z", won: false }),
      entry({ created_at: "2026-10-02T10:00:00Z", won: true }),
      entry({ created_at: "2026-10-03T10:00:00Z", won: true }),
      entry({ created_at: "2026-10-04T10:00:00Z", won: false, finished: false }),
      entry({ created_at: "2026-10-05T10:00:00Z", won: true }),
    ]);
    expect(s?.streak).toEqual({ kind: "W", count: 3 });
    expect(historySummary([entry({ won: false, created_at: "2026-10-02T10:00:00Z" }), entry({ won: true, created_at: "2026-10-01T10:00:00Z" })])?.streak).toEqual({ kind: "L", count: 1 });
  });

  it("lists the last 10 finished results newest first, and nothing from cut-off games (#1388)", () => {
    const games = Array.from({ length: 12 }, (_, i) =>
      entry({ created_at: `2026-10-${String(i + 1).padStart(2, "0")}T10:00:00Z`, won: i % 3 !== 0 }),
    );
    games.push(entry({ created_at: "2026-10-20T10:00:00Z", won: true, finished: false }));
    const s = historySummary(games)!;
    expect(s.recent).toHaveLength(10);
    // Games 12..3 newest first; i % 3 === 0 lost.
    expect(s.recent).toEqual(["W", "W", "L", "W", "W", "L", "W", "W", "L", "W"]);
    expect(s.games).toBe(12);
  });
});

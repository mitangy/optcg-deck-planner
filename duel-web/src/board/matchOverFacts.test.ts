import { afterEach, describe, expect, it, vi } from "vitest";
import type { MatchHistoryEntry } from "../history/historyApi";
import { matchOverFacts, pollMatchRecord } from "./matchOverFacts";

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

describe("pollMatchRecord", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps retrying past the live game's unfinished save and shows the finished Bounty (#319)", async () => {
    vi.useFakeTimers();
    // What the server returns before the result is written back: the per-turn save, no rating yet.
    const unfinished = record({ finished: false, rating_before: 0, rating_after: 0 });
    const finished = record({ finished: true, rating_before: 1028, rating_after: 1012 });
    const responses = [unfinished, unfinished, finished];
    const load = vi.fn(async () => responses.shift()!);
    const shown: string[] = [];
    pollMatchRecord("room-1", load, (entry) => shown.push(matchOverFacts(9, entry).rating ?? ""));

    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(shown).toEqual([]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(shown).toEqual([]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).toHaveBeenCalledTimes(3);
    expect(shown).toEqual(["Bounty 1028 → 1012 (−16)"]);
  });
});

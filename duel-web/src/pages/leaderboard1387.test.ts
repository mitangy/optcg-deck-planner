import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLeaderboard, type LeaderboardEntry } from "../net/api";
import { filterEntries, movement, provisionalDividerAt } from "./leaderboardModel";

const entry = (user_id: number, rank: number, over: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({
  user_id,
  name: `Player ${user_id}`,
  username: `Rival${user_id}`,
  rating: 1000,
  games_played: 20,
  rank,
  provisional: false,
  wins: 0,
  losses: 0,
  ...over,
});

describe("leaderboard movement since yesterday (#1387)", () => {
  it("says up, down and new in text a screen reader can read, and nothing for no change (#1387)", () => {
    expect(movement(3)).toEqual({ kind: "up", label: "▲3", spoken: "up 3 since yesterday" });
    expect(movement(-1)).toEqual({ kind: "down", label: "▼1", spoken: "down 1 since yesterday" });
    expect(movement(null)?.label).toBe("New");
    expect(movement(0)).toBeNull();
    expect(movement(undefined)).toBeNull();
  });
});

describe("leaderboard filters (#1387)", () => {
  const rows = [entry(1, 1, { username: "Zoro" }), entry(2, 2, { username: "Nami" }), entry(3, 2, { username: "Namine", name: "Someone" }), entry(4, 4, { username: null, name: "Luffy" })];

  it("matches the name or username without caring about case and keeps each player's server rank (#1387)", () => {
    const out = filterEntries(rows, " nAm ", null, null);
    expect(out.map((e) => [e.user_id, e.rank])).toEqual([[2, 2], [3, 2]]);
    expect(filterEntries(rows, "luf", null, null).map((e) => e.user_id)).toEqual([4]);
  });

  it("the Friends filter keeps friends and you only (#1387)", () => {
    const out = filterEntries(rows, "", new Set([1]), 4);
    expect(out.map((e) => e.user_id)).toEqual([1, 4]);
  });
});

describe("provisional divider (#1387)", () => {
  it("goes before the first provisional row, and nowhere when they all are or none are (#1387)", () => {
    expect(provisionalDividerAt([entry(1, 1), entry(2, 2), entry(3, 3, { provisional: true }), entry(4, 4, { provisional: true })])).toBe(2);
    expect(provisionalDividerAt([entry(1, 1), entry(2, 2)])).toBe(-1);
    expect(provisionalDividerAt([entry(1, 1, { provisional: true })])).toBe(-1);
  });
});

describe("fetchLeaderboard errors (#1387)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = (status: number) =>
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(status === 200 ? { entries: [{ user_id: 1 }] } : { detail: "x" }), { status }));

  it("throws on a server error so the page can offer Try again, but a 404 is an empty board (#1387)", async () => {
    stub(503);
    await expect(fetchLeaderboard(5)).rejects.toThrow();
    stub(404);
    await expect(fetchLeaderboard(5)).resolves.toEqual([]);
    stub(200);
    await expect(fetchLeaderboard(5, "week")).resolves.toHaveLength(1);
  });

  it("asks the server for the chosen window (#1387)", async () => {
    let url = "";
    vi.stubGlobal("fetch", async (u: string) => {
      url = u;
      return new Response(JSON.stringify({ entries: [] }), { status: 200 });
    });
    await fetchLeaderboard(100, "month");
    expect(url).toContain("window=month");
  });
});

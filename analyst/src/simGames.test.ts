import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "./catalog";
import { buildTools } from "./server";
import { getSimGame, importSimGames, listMySimGames, simMatchups, type SimGameDetail } from "./matches";
import { listMySimGamesSummary, narrateSimGame, reviewSimGame, simDeckList, simRecord } from "./simGames";
import { parseSimGame } from "@optcg/rules/src/sim/optcgsim";

const FIXTURES = "../packages/rules/src/sim/optcgsim/__fixtures__";
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`${FIXTURES}/${name}`, `file://${process.cwd()}/`), "utf8")) as Record<string, any>;

/** The row the planner would hold for a fixture game: names swapped for the placeholders it stores. */
function storedRow(name: string, id = "g1"): SimGameDetail {
  const raw = fixture(name);
  const clean = (s: string) => s.replace(/​/g, "").replaceAll("PlayerA#1", "Me#1").replaceAll("PlayerB#2", "Opp#2");
  return {
    id,
    played_at: "2026-07-20T04:58:40+00:00",
    my_leader: raw.playerLeader,
    opp_leader: raw.oppLeader,
    my_deck: raw.decklist,
    opp_deck: raw.oppDecklist,
    result: raw.result,
    turns: raw.turnNumber,
    went_first: raw.turnOrder === 0,
    has_log: true,
    combat_log: clean(raw.combatLog),
    source: "optcgsim",
  };
}

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };
function serve(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? "GET", headers: init.headers as Record<string, string>, body: init.body as string | undefined });
    const path = url.replace("https://api.test", "");
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    return key ? new Response(JSON.stringify(routes[key]), { status: 200 }) : new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  return { calls, api: { baseUrl: "https://api.test", serviceSecret: "", fetchImpl } };
}

describe("imported OPTCGSim games (#1030)", () => {
  it("reads and imports sim games with the player's token only (#1030)", async () => {
    const { calls, api } = serve({ "/analyst/sim-games/import": { imported: 1 }, "/analyst/sim-games/matchups": { matchups: [] }, "/analyst/sim-games": { games: [], total: 0 } });
    await listMySimGames(api, "tok", 5);
    await simMatchups(api, "tok");
    await importSimGames(api, "tok", [{ a: 1 }]);
    await getSimGame(api, "tok", "a/b").catch(() => undefined);
    expect(calls.map((c) => [c.method, c.url, c.headers])).toEqual([
      ["GET", "https://api.test/analyst/sim-games?limit=5", { "X-Analyst-Token": "tok" }],
      ["GET", "https://api.test/analyst/sim-games/matchups", { "X-Analyst-Token": "tok" }],
      ["POST", "https://api.test/analyst/sim-games/import", { "X-Analyst-Token": "tok", "Content-Type": "application/json" }],
      ["GET", "https://api.test/analyst/sim-games/a%2Fb", { "X-Analyst-Token": "tok" }],
    ]);
    expect(JSON.parse(calls[2]!.body!)).toEqual({ games: [{ a: 1 }] });
  });

  it("reviews a stored game turn by turn from the player's seat (#1030)", async () => {
    const { api } = serve({ "/analyst/sim-games/g1": storedRow("game-me-first-won.json") });
    const review = await reviewSimGame(api, "tok", "g1");
    expect(review).toMatchObject({ gameId: "g1", source: "optcgsim", wentFirst: true, result: { won: true }, yourLeaderId: "OP16-080", opponentLeaderId: "OP16-060" });
    expect(review.log[0]).toBe("--- Turn 1 (your turn) ---");
    expect(review.log[1]).toMatch(/^Your hand after the draw: Doc Q \(counter 2000\), /);
    expect(review.log.some((l) => l === "--- Turn 2 (opponent's turn) ---")).toBe(true);
    expect(review.log.some((l) => l.startsWith("Your board: Leader "))).toBe(true);
    expect(review.log.some((l) => l.startsWith("Opponent's board: Leader "))).toBe(true);
    expect(review.log.join("\n")).toContain("You played Doc Q.");
    expect(review.yourDeck.find((d) => d.id === "OP09-093")).toMatchObject({ copies: 4 });
    expect(review.opponentDeck.length).toBeGreaterThan(5);
    expect(review.finalState.turn).toBeGreaterThan(5);
  });

  it("tells a second-seat loss from a first-seat win (#1030)", async () => {
    const { api } = serve({ "/analyst/sim-games/g2": storedRow("game-me-second-lost.json", "g2") });
    const review = await reviewSimGame(api, "tok", "g2");
    expect(review.wentFirst).toBe(false);
    expect(review.result).toMatchObject({ won: false });
    expect(review.log[0]).toBe("--- Turn 1 (opponent's turn) ---");
  });

  it("names none of the opponent's face-down hand and only counts it (#1030)", async () => {
    const { api } = serve({ "/analyst/sim-games/g1": storedRow("game-me-first-won.json") });
    const review = await reviewSimGame(api, "tok", "g1");
    // Turn 1: five cards in the opponent's hand, none of them seen (their starting hand is in the raw log).
    expect(review.log[2]).toBe("Opponent's hand: 5 cards; known to you: none (the rest were drawn face down).");
    for (const line of review.log.filter((l) => l.startsWith("Opponent's hand: "))) {
      expect(line).toMatch(/^Opponent's hand: \d+ cards; known to you: .+ \(the rest were drawn face down\)\.$/);
    }
    // The opening hands are not in the review at all.
    expect(review).not.toHaveProperty("opponentOpeningHand");
    expect(review).not.toHaveProperty("yourOpeningHand");
  });

  it("reads only the asked turns and cuts long logs (#1030)", () => {
    const game = parseSimGame(simRecord(storedRow("game-me-first-won.json")));
    const mid = narrateSimGame(game, { fromTurn: 3, toTurn: 4 });
    expect(mid.log[0]).toBe("--- Turn 3 (your turn) ---");
    expect(mid.log.filter((l) => l.startsWith("--- Turn "))).toEqual(["--- Turn 3 (your turn) ---", "--- Turn 4 (opponent's turn) ---"]);
    const cut = narrateSimGame(game, { maxLines: 7 });
    expect(cut.log).toHaveLength(7);
    expect(cut.truncated).toBe(true);
    expect(cut.notes.join(" ")).toMatch(/Log cut at 7 lines/);
    expect(narrateSimGame(game).truncated).toBe(false);
  });

  it("maps the stored went_first flag onto the reader's turn order (#1030)", () => {
    const row = storedRow("game-me-first-won.json");
    expect(simRecord({ ...row, went_first: true }).turnOrder).toBe(0);
    expect(simRecord({ ...row, went_first: false }).turnOrder).toBe(1);
    expect(simRecord({ ...row, went_first: null }).turnOrder).toBeUndefined();
    expect(simRecord(row)).toMatchObject({ playerName: "Me#1", oppPlayerName: "Opp#2", result: "Won" });
  });

  it("refuses a game that was imported without a log (#1030)", async () => {
    const { api } = serve({ "/analyst/sim-games/g3": { ...storedRow("game-me-first-won.json", "g3"), combat_log: null, has_log: false } });
    await expect(reviewSimGame(api, "tok", "g3")).rejects.toThrow(/without a combat log/);
  });

  it("lists games with leader names and a matchup tally, labelled as OPTCGSim (#1030)", async () => {
    const row = storedRow("game-me-first-won.json");
    const { combat_log: _log, ...meta } = row;
    const { api } = serve({
      "/analyst/sim-games/matchups": { matchups: [{ my_leader: "OP16-080", opp_leader: "OP16-060", games: 3, wins: 2, losses: 1 }] },
      "/analyst/sim-games": { games: [meta], total: 9 },
    });
    const out = await listMySimGamesSummary(api, "tok", 1);
    expect(out.total).toBe(9);
    expect(out.note).toMatch(/OPTCGSim games the player imported/);
    expect(out.games[0]).toMatchObject({ my_leader_name: "Marshall.D.Teach", opp_leader_name: "Sengoku" });
    expect(out.games[0]).not.toHaveProperty("combat_log");
    expect(out.matchups[0]).toMatchObject({ games: 3, wins: 2, losses: 1, opp_leader_name: "Sengoku" });
  });

  it("sorts a deck by card number with its copies (#1030)", () => {
    expect(simDeckList(["4xOP09-093", "2xEB04-058", "junk"]).map((d) => [d.id, d.copies])).toEqual([["EB04-058", 2], ["OP09-093", 4]]);
  });

  it("serves both tools on a personal link only (#1030)", async () => {
    const catalog = loadCatalog();
    const { api } = serve({ "/analyst/sim-games/g1": storedRow("game-me-first-won.json"), "/analyst/sim-games/matchups": { matchups: [] }, "/analyst/sim-games": { games: [], total: 0 } });
    const anon = buildTools(catalog, undefined, undefined, { stats: api }).map((t) => t.name);
    expect(anon).not.toContain("list_my_sim_games");
    expect(anon).not.toContain("review_sim_game");
    const tools = buildTools(catalog, undefined, { api, token: "tok" }, { stats: api });
    const review = await tools.find((t) => t.name === "review_sim_game")!.run({ gameId: "g1", maxLines: 20 });
    expect(JSON.parse(review.content[0]!.text)).toMatchObject({ gameId: "g1", truncated: true });
    const list = await tools.find((t) => t.name === "list_my_sim_games")!.run({});
    expect(JSON.parse(list.content[0]!.text)).toMatchObject({ total: 0 });
  });
});

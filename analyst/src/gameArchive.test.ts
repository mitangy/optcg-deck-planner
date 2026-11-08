import { getCardDef } from "@optcg/rules";
import { describe, expect, it } from "vitest";
import { narrateGame, replayGame, searchGames } from "./matches";
import { lifeTakenGame } from "./testFixtures";
import { planner } from "./testkit";

const { replay, taken } = lifeTakenGame();

describe("game archive", () => {
  it("names every hidden card in an archive replay and calls the seats Player A and B (#377)", () => {
    const game = narrateGame(replay);
    const side = taken.seat === 0 ? "A" : "B";
    expect(game.log).toContain(`Player ${side} takes Life (${getCardDef(taken.defId).name})`);
    expect(game.log[0]).toBe("--- Turn 1 (Player A's turn) ---");
    expect(game.result).toEqual({ winner: side === "A" ? "B" : "A", reason: "concede" });
    expect(game.openingHands.A).toHaveLength(5);
    expect(game.openingHands.A).not.toEqual(game.openingHands.B);
  });

  it("searches the archive with the service secret only, never a player token (#377)", async () => {
    const { calls, api } = planner({
      "GET /analyst/corpus/games": { total: 1, offset: 0, window_days: 30, games: [{ game_id: "g_1", A: { leader: "OP01-001" }, B: { leader: "OP01-060" } }] },
      "GET /analyst/corpus/games/g_1/replay": { game_id: "g_1", date: null, ranked: true, rating_bands: {}, replay },
    });
    const found = await searchGames(api, { leader: " op01-001", result: "lost", wentFirst: false, days: 30 });
    expect(calls[0]).toEqual({
      url: "https://api.test/analyst/corpus/games?leader=OP01-001&result=lost&went_first=false&days=30",
      method: "GET",
      headers: { "X-Analyst-Service": "svc" },
      body: undefined,
    });
    expect(found.games[0]!.A.leader_name).toBe(getCardDef("OP01-001").name);
    const game = await replayGame(api, "g_1");
    expect(calls[1]!.headers).toEqual({ "X-Analyst-Service": "svc" });
    expect(game.gameId).toBe("g_1");
  });
});

import {
  applyIntent,
  buildTestDeck,
  createMatch,
  createSeededRng,
  DEFAULT_LEADER_ID,
  getCardDef,
  listLegalIntents,
  MATCH_REPLAY_SCHEMA,
  skipMulligans,
  type GameEvent,
  type MatchReplay,
  type Seat,
} from "@optcg/rules";
import { describe, expect, it } from "vitest";
import { narrateReplay, reviewMatch, tokenIsValid } from "./matches";

/** Play legal moves until a Life card goes to a hand. */
function gameWithLifeTaken(): { replay: MatchReplay; taken: Extract<GameEvent, { type: "life_taken" }> } {
  const players: MatchReplay["players"] = [
    { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) },
    { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) },
  ];
  const seed = 17;
  const rng = createSeededRng(seed);
  let state = skipMulligans(createMatch({ seed, firstSeat: 0, players: [{ ...players[0], deck: [...players[0].deck] }, { ...players[1], deck: [...players[1].deck] }] }), rng);
  const intents: MatchReplay["intents"] = [];
  for (let i = 0; i < 500 && state.winner === null; i++) {
    const seat = (([0, 1] as Seat[]).find((s) => listLegalIntents(state, s).length > 0))!;
    const legal = listLegalIntents(state, seat);
    // Attack whenever possible and never block or counter, so Life gets taken quickly.
    const intent =
      legal.find((x) => x.type.includes("attack")) ??
      legal.find((x) => x.type.startsWith("pass")) ??
      legal.find((x) => x.type === "end_turn") ??
      legal[0]!;
    const result = applyIntent(state, intent, { seat, rng });
    expect(result.ok).toBe(true);
    state = result.state;
    intents.push({ seat, intent });
    const taken = result.events.find((e): e is Extract<GameEvent, { type: "life_taken" }> => e.type === "life_taken" && e.toHand);
    if (taken) {
      return {
        replay: { schema: MATCH_REPLAY_SCHEMA, rulesVersion: "t", registryHash: "t", seed, firstSeat: 0, skipMulligans: true, players, intents, end: { winner: (1 - taken.seat) as Seat, reason: "concede" } },
        taken,
      };
    }
  }
  throw new Error("no Life was taken");
}

const { replay, taken } = gameWithLifeTaken();
const lifeCard = getCardDef(taken.defId).name;

describe("match review", () => {
  it("names a taken Life card only for the player who took it (#244)", () => {
    const owner = narrateReplay(replay, taken.seat);
    const other = narrateReplay(replay, (1 - taken.seat) as Seat);
    expect(owner.log).toContain(`Seat ${taken.seat} (you) takes Life (${lifeCard} → hand)`);
    expect(other.log).toContain(`Seat ${taken.seat} (opponent) takes Life (a hidden card → hand)`);
  });

  it("tells the game from the reviewing player's seat (#244)", () => {
    const loser = narrateReplay(replay, taken.seat);
    const winner = narrateReplay(replay, (1 - taken.seat) as Seat);
    expect(loser.result).toEqual({ won: false, reason: "concede" });
    expect(winner.result).toEqual({ won: true, reason: "concede" });
    expect(narrateReplay(replay, 0).wentFirst).toBe(true);
    expect(narrateReplay(replay, 1).wentFirst).toBe(false);
    expect(narrateReplay(replay, 0).log[0]).toBe("--- Turn 1 (your turn) ---");
    expect(narrateReplay(replay, 1).log[0]).toBe("--- Turn 1 (opponent's turn) ---");
    // Each player sees their own opening hand, and the two differ.
    const hands = [narrateReplay(replay, 0).yourOpeningHand, narrateReplay(replay, 1).yourOpeningHand];
    expect(hands[0]).toHaveLength(5);
    expect(hands[0]).not.toEqual(hands[1]);
  });

  it("reads only the asked turns and cuts long logs (#244)", () => {
    const full = narrateReplay(replay, 0).log;
    const start = full.indexOf("--- Turn 2 (opponent's turn) ---");
    const end = full.indexOf("--- Turn 3 (your turn) ---");
    expect(end - start).toBeGreaterThan(1);
    expect(full.length).toBeGreaterThan(end + 1);
    expect(narrateReplay(replay, 0, { fromTurn: 2, toTurn: 2 }).log).toEqual(full.slice(start, end));
    const short = narrateReplay(replay, 0, { maxLines: 3 });
    expect(short.log).toHaveLength(3);
    expect(short.truncated).toBe(true);
  });

  it("asks the planner for a replay with the player's token and the service secret (#244)", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      return new Response(JSON.stringify({ match_id: "m 1", your_seat: 1, replay }), { status: 200 });
    }) as unknown as typeof fetch;
    const api = { baseUrl: "https://api.test/", serviceSecret: "svc", fetchImpl: fakeFetch };
    const review = await reviewMatch(api, "tok", "m 1");
    expect(calls).toEqual([{ url: "https://api.test/analyst/matches/m%201/replay", headers: { "X-Analyst-Token": "tok", "X-Analyst-Service": "svc" } }]);
    expect(review.yourSeat).toBe(1);
    await expect(reviewMatch({ ...api, serviceSecret: "" }, "tok", "m 1")).rejects.toThrow(/ANALYST_SERVICE_SECRET/);
    expect(calls).toHaveLength(1);
  });

  it("treats only a 401 as a dead personal link (#244)", async () => {
    const answer = (status: number) => ({ baseUrl: "https://api.test", serviceSecret: "", fetchImpl: (async () => new Response("{}", { status })) as unknown as typeof fetch });
    await expect(tokenIsValid(answer(200), "t")).resolves.toBe(true);
    await expect(tokenIsValid(answer(401), "t")).resolves.toBe(false);
    await expect(tokenIsValid(answer(502), "t")).rejects.toThrow(/HTTP 502/);
  });
});

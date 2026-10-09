import {
  applyIntent,
  buildTestDeck,
  createMatch,
  createSeededRng,
  DEFAULT_LEADER_ID,
  getCardDef,
  listLegalIntents,
  MATCH_REPLAY_SCHEMA,
  seatLog,
  skipMulligans,
  type GameEvent,
  type MatchReplay,
  type Seat,
} from "@optcg/rules";
import { describe, expect, it } from "vitest";
import { groupTurns } from "./sources";
import { draftLesson, matchupStats, myLessons, narrateGame, narrateReplay, reviewMatch, tokenIsValid, tournamentStats } from "./matches";

/** Play legal moves until a Life card is taken as damage. */
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
    const taken = result.events.find((e): e is Extract<GameEvent, { type: "life_taken" }> => e.type === "life_taken");
    if (taken) {
      return {
        replay: { schema: MATCH_REPLAY_SCHEMA, rulesVersion: "t", registryHash: "t", seed, firstSeat: 0, skipMulligans: true, lifeCheckEveryHit: true, privateChoicesV2: true, players, intents, end: { winner: (1 - taken.seat) as Seat, reason: "concede" } },
        taken,
      };
    }
  }
  throw new Error("no Life was taken");
}

const { replay, taken } = gameWithLifeTaken();

/** A game with the mulligan step played, as duel-web records it: each seat's choice, then seat 0 and seat 1 end a turn each. */
function gameWithMulligans(seed: number, redraw: [boolean, boolean]) {
  const players: MatchReplay["players"] = [
    { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) },
    { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) },
  ];
  const rng = createSeededRng(seed);
  let state = createMatch({ seed, firstSeat: 0, players: [{ ...players[0], deck: [...players[0].deck] }, { ...players[1], deck: [...players[1].deck] }] });
  const dealt = state.players.map((p) => p.hand.map((c) => getCardDef(c.defId).name));
  const intents: MatchReplay["intents"] = [
    { seat: 0, intent: { type: "mulligan", doMulligan: redraw[0] } },
    { seat: 1, intent: { type: "mulligan", doMulligan: redraw[1] } },
    { seat: 0, intent: { type: "end_turn" } },
    { seat: 1, intent: { type: "end_turn" } },
  ];
  let kept: string[][] = [];
  for (const [i, { seat, intent }] of intents.entries()) {
    const result = applyIntent(state, intent, { seat, rng });
    expect(result.ok).toBe(true);
    state = result.state;
    if (i === 1) kept = state.players.map((p) => p.hand.map((c) => getCardDef(c.defId).name));
  }
  expect(state.turnNumber).toBe(3);
  const played: MatchReplay = { schema: MATCH_REPLAY_SCHEMA, rulesVersion: "t", registryHash: "t", seed, firstSeat: 0, skipMulligans: false, lifeCheckEveryHit: true, privateChoicesV2: true, players, intents };
  return { replay: played, dealt, kept };
}
const lifeCard = getCardDef(taken.defId).name;

describe("match review", () => {
  it("names a taken Life card only for the player who took it (#244)", () => {
    const owner = narrateReplay(replay, taken.seat);
    const other = narrateReplay(replay, (1 - taken.seat) as Seat);
    expect(owner.log).toContain(`Seat ${taken.seat} (you) takes Life (${lifeCard})`);
    expect(other.log).toContain(`Seat ${taken.seat} (opponent) takes Life`);
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

  it("numbers turns like the engine when the mulligan step was played", () => {
    const { replay: played } = gameWithMulligans(5, [false, false]);
    const review = narrateReplay(played, 0);
    expect(review.finalState.turn).toBe(3);
    const headers = review.log.filter((l) => l.startsWith("---"));
    expect(headers).toEqual(["--- Turn 1 (your turn) ---", "--- Turn 2 (opponent's turn) ---", "--- Turn 3 (your turn) ---"]);
    // Seat 0's first turn (no draw, one DON!!) is read under Turn 1, including with fromTurn/toTurn.
    const turn1 = narrateReplay(played, 0, { fromTurn: 1, toTurn: 1 }).log;
    expect(turn1[0]).toBe("--- Turn 1 (your turn) ---");
    expect(turn1.length).toBeGreaterThan(1);
    expect(turn1).toEqual(review.log.slice(0, review.log.indexOf("--- Turn 2 (opponent's turn) ---")));
  });

  it("gives the opening hand after a mulligan redraw", () => {
    const { replay: played, dealt, kept } = gameWithMulligans(5, [true, false]);
    expect(kept[0]).not.toEqual(dealt[0]);
    expect(narrateReplay(played, 0).yourOpeningHand).toEqual(kept[0]);
    expect(narrateReplay(played, 1).yourOpeningHand).toEqual(kept[1]);
  });

  const names = (ids: string[] | undefined) => (ids ?? []).map((id) => getCardDef(id).name).join(", ") || "empty";

  it("lists your hand after the draw inside each turn, and the opponent's hand once the game is over (#472)", () => {
    for (const seat of [0, 1] as Seat[]) {
      const turns = seatLog(replay, seat, { revealOpponent: true }).turns.filter((t) => t.turn > 0);
      const grouped = groupTurns(narrateReplay(replay, seat).log).filter((g) => g.turn > 0);
      expect(grouped.length).toBe(turns.length);
      let differs = 0;
      for (const [i, t] of turns.entries()) {
        const lines = grouped[i]!.lines;
        expect(grouped[i]!.turn).toBe(t.turn);
        expect(lines).toContain(`Your hand after the draw: ${names(t.hand)}.`);
        expect(lines).toContain(`Opponent's hand (revealed after the game): ${names(t.opponentHand)}.`);
        if (names(t.hand) !== names(t.opponentHand)) differs += 1;
      }
      // The two hands must be told apart, or swapping them would pass.
      expect(differs).toBeGreaterThan(0);
    }
  });

  it("keeps the opponent's hand out of a game that has no end yet (#472)", () => {
    const { replay: played, kept } = gameWithMulligans(5, [false, false]);
    const review = narrateReplay(played, 0);
    const handLines = review.log.filter((l) => l.includes("hand"));
    expect(handLines.length).toBeGreaterThan(0);
    expect(handLines.every((l) => l.startsWith("Your hand after the draw: "))).toBe(true);
    expect(review.log.join("\n")).not.toContain("Opponent's hand");
    expect(review).not.toHaveProperty("opponentOpeningHand");
    // The first player skips the draw, so turn 1 shows the hand kept after the mulligan.
    expect(review.log).toContain(`Your hand after the draw: ${kept[0]!.join(", ")}.`);
    expect(narrateReplay(replay, 0).opponentOpeningHand).toEqual(narrateReplay(replay, 1).yourOpeningHand);
    expect(narrateReplay(replay, 0).opponentOpeningHand).not.toEqual(narrateReplay(replay, 0).yourOpeningHand);
  });

  it("lists both players' hands each turn in a corpus game (#472)", () => {
    const log = narrateGame(replay).log;
    const turns = seatLog(replay, 0, { revealOpponent: true }).turns.filter((t) => t.turn > 0);
    const grouped = groupTurns(log).filter((g) => g.turn > 0);
    expect(grouped.length).toBe(turns.length);
    for (const [i, t] of turns.entries()) {
      expect(grouped[i]!.lines).toContain(`Player A's hand: ${names(t.hand)}.`);
      expect(grouped[i]!.lines).toContain(`Player B's hand: ${names(t.opponentHand)}.`);
    }
  });

  it("counts hand lines against maxLines and keeps them inside their turn (#472)", () => {
    const review = narrateReplay(replay, 0, { maxLines: 2 });
    expect(review.log).toHaveLength(2);
    expect(review.log[1]).toMatch(/^Your hand after the draw: /);
    expect(review.truncated).toBe(true);
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

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };
function recorder(answer: unknown) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? "GET", headers: init.headers as Record<string, string>, body: init.body as string | undefined });
    return new Response(JSON.stringify(answer), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, api: { baseUrl: "https://api.test", serviceSecret: "svc", fetchImpl } };
}

describe("learning loop", () => {
  it("reads matchup stats with the service secret only and names every card (#246)", async () => {
    const { calls, api } = recorder({ leader: "OP01-001", matchups: [{ opponent: "OP01-060", games: 6 }], cards: [{ id: "OP01-006", with_rate: 0.5 }] });
    const stats = (await matchupStats(api, { leader: " op01-001", opponent: "op01-060", days: 30, rankedOnly: true })) as Record<string, any>;
    expect(calls).toEqual([
      { url: "https://api.test/analyst/stats/matchups?leader=OP01-001&opponent=OP01-060&days=30&ranked_only=true", method: "GET", headers: { "X-Analyst-Service": "svc" }, body: undefined },
    ]);
    expect(stats.leader_name).toBe(getCardDef("OP01-001").name);
    expect(stats.matchups[0].opponent_name).toBe(getCardDef("OP01-060").name);
    expect(stats.cards[0].id_name).toBe(getCardDef("OP01-006").name);
    await expect(matchupStats({ ...api, serviceSecret: "" }, {})).rejects.toThrow(/ANALYST_SERVICE_SECRET/);
    expect(calls).toHaveLength(1);
  });

  it("reads tournament stats with the service secret only and names leaders and cards, but not events (#397)", async () => {
    const { calls, api } = recorder({
      leader: "OP01-001",
      events: [{ id: "6abcfe1c783097f8dcb74092", name: "Cup" }],
      opponents: [{ opponent: "OP01-060", games: 6 }],
      cards: [{ id: "OP01-006", rate: 0.5 }],
      top_placings: [{ event_id: "6abcfe1c783097f8dcb74092", decklist: { "OP01-006": 4 } }],
    });
    const stats = (await tournamentStats(api, { leader: " op01-001", opponent: "op01-060", days: 14, minPlayers: 16 })) as Record<string, any>;
    expect(calls).toEqual([
      { url: "https://api.test/analyst/tournaments/stats?leader=OP01-001&opponent=OP01-060&days=14&min_players=16", method: "GET", headers: { "X-Analyst-Service": "svc" }, body: undefined },
    ]);
    expect(stats.leader_name).toBe(getCardDef("OP01-001").name);
    expect(stats.opponents[0].opponent_name).toBe(getCardDef("OP01-060").name);
    expect(stats.cards[0].id_name).toBe(getCardDef("OP01-006").name);
    expect(stats.events[0]).toEqual({ id: "6abcfe1c783097f8dcb74092", name: "Cup" });
    await expect(tournamentStats({ ...api, serviceSecret: "" }, {})).rejects.toThrow(/ANALYST_SERVICE_SECRET/);
    expect(calls).toHaveLength(1);
  });

  it("posts a lesson draft as JSON with the player's token (#246)", async () => {
    const { calls, api } = recorder({ id: 7, status: "draft" });
    const lesson = { text: "Keep Kuzan for the turn they swing with 2 rested DON", leader_id: "OP01-001", match_ids: ["m1"] };
    await expect(draftLesson(api, "tok", lesson)).resolves.toEqual({ id: 7, status: "draft" });
    expect(calls).toEqual([
      { url: "https://api.test/analyst/lessons", method: "POST", headers: { "X-Analyst-Token": "tok", "Content-Type": "application/json" }, body: JSON.stringify(lesson) },
    ]);
  });

  it("asks for lessons by status and leader (#246)", async () => {
    const { calls, api } = recorder({ lessons: [{ id: 1 }] });
    await expect(myLessons(api, "tok", "draft", " op01-001 ")).resolves.toEqual([{ id: 1 }]);
    await myLessons(api, "tok");
    expect(calls.map((c) => c.url)).toEqual(["https://api.test/analyst/lessons?status=draft&leader=OP01-001", "https://api.test/analyst/lessons?status=approved"]);
    expect(calls[0]!.headers).toEqual({ "X-Analyst-Token": "tok" });
  });
});

import { describe, expect, it } from "vitest";
import { buildTestDeck, DEFAULT_LEADER_ID, getCardDef } from "../cards/definitions.js";
import { applyIntent, createMatch, listLegalIntents, skipMulligans } from "../engine.js";
import { MATCH_REPLAY_SCHEMA, replayMatch, type MatchReplay } from "../matchReplay.js";
import { createSeededRng } from "../rng.js";
import { seatLog } from "../seatLog.js";
import type { GameEvent, MatchState, Seat } from "../types.js";

/** Play cards and attack whenever possible until a Life card goes to a hand. */
function playedGame() {
  const players: MatchReplay["players"] = [
    { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) },
    { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) },
  ];
  const seed = 23;
  const rng = createSeededRng(seed);
  let state: MatchState = skipMulligans(
    createMatch({ seed, firstSeat: 0, players: [{ ...players[0], deck: [...players[0].deck] }, { ...players[1], deck: [...players[1].deck] }] }),
    rng,
  );
  const hands = [state.players[0].hand.map((c) => c.defId), state.players[1].hand.map((c) => c.defId)];
  const intents: MatchReplay["intents"] = [];
  const played: { instanceId: string; turn: number }[] = [];
  let taken: { event: Extract<GameEvent, { type: "life_taken" }>; turn: number } | null = null;
  for (let i = 0; i < 800 && state.winner === null && !(taken && played.length); i++) {
    const seat = ([0, 1] as Seat[]).find((s) => listLegalIntents(state, s).length > 0)!;
    const legal = listLegalIntents(state, seat);
    const intent =
      legal.find((x) => x.type === "play_card") ??
      legal.find((x) => x.type.includes("attack")) ??
      legal.find((x) => x.type.startsWith("pass")) ??
      legal.find((x) => x.type === "end_turn") ??
      legal[0]!;
    const result = applyIntent(state, intent, { seat, rng });
    expect(result.ok).toBe(true);
    state = result.state;
    intents.push({ seat, intent });
    for (const e of result.events) {
      if (e.type === "card_played" && getCardDef(e.defId).type === "character") played.push({ instanceId: e.instanceId, turn: state.turnNumber });
      if (e.type === "life_taken" && e.toHand && !taken) taken = { event: e, turn: state.turnNumber };
    }
  }
  if (!taken || !played.length) throw new Error("test game never took a Life card or played a Character");
  const replay: MatchReplay = { schema: MATCH_REPLAY_SCHEMA, rulesVersion: "t", registryHash: "t", seed, firstSeat: 0, skipMulligans: true, players, intents };
  return { replay, hands, played, taken };
}

/** The mulligan step played, as duel-web records it: seat 0 redraws, seat 1 keeps, then each ends a turn. */
function gameWithMulligans() {
  const players: MatchReplay["players"] = [
    { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) },
    { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) },
  ];
  const seed = 5;
  const rng = createSeededRng(seed);
  let state = createMatch({ seed, firstSeat: 0, players: [{ ...players[0], deck: [...players[0].deck] }, { ...players[1], deck: [...players[1].deck] }] });
  const dealt = state.players[0].hand.map((c) => c.defId);
  const intents: MatchReplay["intents"] = [
    { seat: 0, intent: { type: "mulligan", doMulligan: true } },
    { seat: 1, intent: { type: "mulligan", doMulligan: false } },
    { seat: 0, intent: { type: "end_turn" } },
    { seat: 1, intent: { type: "end_turn" } },
  ];
  let kept: string[][] = [];
  for (const [i, { seat, intent }] of intents.entries()) {
    const result = applyIntent(state, intent, { seat, rng });
    expect(result.ok).toBe(true);
    state = result.state;
    if (i === 1) kept = state.players.map((p) => p.hand.map((c) => c.defId));
  }
  expect(state.turnNumber).toBe(3);
  const replay: MatchReplay = { schema: MATCH_REPLAY_SCHEMA, rulesVersion: "t", registryHash: "t", seed, firstSeat: 0, skipMulligans: false, players, intents };
  return { replay, dealt, kept };
}

const game = playedGame();
const lifeEvents = (seat: Seat) =>
  seatLog(game.replay, seat)
    .turns.flatMap((t) => t.events.map((e) => ({ e, turn: t.turn })))
    .filter((x): x is { e: Extract<GameEvent, { type: "life_taken" }>; turn: number } => x.e.type === "life_taken");

describe("match history seat log", () => {
  it("names a taken Life card only for the player who took it (#252)", () => {
    const taker = game.taken.event.seat;
    expect(lifeEvents(taker)[0]!.e.defId).toBe(game.taken.event.defId);
    expect(lifeEvents((1 - taker) as Seat)[0]!.e.defId).toBe("HIDDEN");
  });

  it("files each event under the turn it happened on, with whose turn it was (#252)", () => {
    const log = seatLog(game.replay, 0);
    expect(log.turns[0]).toMatchObject({ turn: 1, activeSeat: 0 });
    expect(log.turns[1]).toMatchObject({ turn: 2, activeSeat: 1 });
    expect(lifeEvents(0)[0]!.turn).toBe(game.taken.turn);
  });

  it("numbers turns like the engine when the mulligan step was played (#252)", () => {
    const log = seatLog(gameWithMulligans().replay, 1);
    expect(log.turns.map((t) => [t.turn, t.activeSeat])).toEqual([[0, 0], [1, 0], [2, 1], [3, 0]]);
    expect(log.turns[0]!.events.filter((e) => e.type === "mulligan_resolved")).toHaveLength(2);
  });

  it("gives the opening hand after a mulligan redraw (#252)", () => {
    const { replay, dealt, kept } = gameWithMulligans();
    expect(kept[0]).not.toEqual(dealt);
    expect(seatLog(replay, 0).openingHand).toEqual(kept[0]);
    expect(seatLog(replay, 1).openingHand).toEqual(kept[1]);
  });

  it("keeps every Character that reached the board so attackers can be named (#252)", () => {
    const ids = new Set(seatLog(game.replay, 0).boardCards.map(([id]) => id));
    for (const p of game.played) expect(ids.has(p.instanceId)).toBe(true);
  });

  it("shows each player their own opening hand (#252)", () => {
    expect(game.hands[0]).not.toEqual(game.hands[1]);
    expect(seatLog(game.replay, 0).openingHand).toEqual(game.hands[0]);
    expect(seatLog(game.replay, 1).openingHand).toEqual(game.hands[1]);
  });

  it("seat log records your hand at the start of each turn (#350)", () => {
    for (const { replay } of [game, gameWithMulligans()]) {
      // Expected values come straight from the engine state after the step that opened each turn.
      const opening = replayMatch({ ...replay, intents: [] });
      const expected = new Map<number, { hands: string[][] }>();
      const snap = (st: MatchState) => ({ hands: st.players.map((p) => p.hand.map((c) => c.defId)) });
      if (opening.phase !== "mulligan") expected.set(opening.turnNumber, snap(opening));
      let prevTurn = opening.turnNumber;
      let hadDraw = false;
      replayMatch(replay, (step) => {
        if (step.state.turnNumber !== prevTurn) {
          expected.set(step.state.turnNumber, snap(step.state));
          if (step.state.turnNumber > 1) hadDraw ||= step.events.some((e) => e.type === "drew");
          prevTurn = step.state.turnNumber;
        }
      });
      expect(hadDraw).toBe(true);
      const logs = ([0, 1] as Seat[]).map((s) => seatLog(replay, s));
      let checked = 0;
      for (const seat of [0, 1] as Seat[]) {
        for (const t of logs[seat]!.turns) {
          if (t.turn === 0) {
            expect(t.hand).toBeUndefined();
            continue;
          }
          expect(t.hand).toEqual(expected.get(t.turn)!.hands[seat]);
          expect(t.opponentHandCount).toBe(expected.get(t.turn)!.hands[1 - seat]!.length);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(2);
      // Per seat: the two players' logs hold different hands for the same turn.
      const t1 = (seat: Seat) => logs[seat]!.turns.find((t) => t.turn === 1)!;
      expect(t1(0).hand).not.toEqual(t1(1).hand);
    }
  });

  it("seat log hand includes the card drawn that turn (#350)", () => {
    // Seat 1 goes second: its turn-2 hand is its opening hand plus the draw, so it is one card larger.
    const { replay, kept } = gameWithMulligans();
    const log = seatLog(replay, 1);
    const turn2 = log.turns.find((t) => t.turn === 2)!;
    expect(turn2.hand).toHaveLength(kept[1]!.length + 1);
    expect(turn2.hand).not.toEqual(log.openingHand);
  });

  it("seat log reveals the opponent's hand each turn only when asked (#359)", () => {
    for (const { replay } of [game, gameWithMulligans()]) {
      for (const seat of [0, 1] as Seat[]) {
        const other = (1 - seat) as Seat;
        const revealed = seatLog(replay, seat, { revealOpponent: true });
        const theirs = seatLog(replay, other);
        // Each turn's opponentHand is what the other seat's own log holds as its hand at that turn.
        const byTurn = new Map(theirs.turns.map((t) => [t.turn, t.hand]));
        let checked = 0;
        for (const t of revealed.turns) {
          if (t.turn === 0) {
            expect(t.opponentHand).toBeUndefined();
            continue;
          }
          expect(t.opponentHand).toEqual(byTurn.get(t.turn));
          expect(t.opponentHand).toHaveLength(t.opponentHandCount!);
          checked++;
        }
        expect(checked).toBeGreaterThan(2);
        expect(revealed.opponentOpeningHand).toEqual(theirs.openingHand);
        expect(revealed.opponentOpeningHand).not.toEqual(revealed.openingHand);

        // Without the flag nothing about the opponent's cards is in the log, only the count.
        for (const hidden of [seatLog(replay, seat), seatLog(replay, seat, { revealOpponent: false })]) {
          expect(JSON.stringify(hidden)).not.toContain('"opponentHand"');
          expect(JSON.stringify(hidden)).not.toContain('"opponentOpeningHand"');
          expect(hidden.turns.some((t) => t.opponentHandCount != null)).toBe(true);
        }
      }
    }
  });
});

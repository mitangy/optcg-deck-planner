/** Finished bot games for tests (#635): easy bots through the real engine, so the replays are real-format. */
import {
  applyIntent,
  buildTestDeck,
  createMatch,
  createSeededRng,
  DEFAULT_LEADER_ID,
  listLegalIntents,
  MATCH_REPLAY_SCHEMA,
  skipMulligans,
  type GameEvent,
  type MatchReplay,
  type Seat,
} from "@optcg/rules";
import { playBotGame, type BotGameResult } from "@optcg/rules/src/sim/selfPlay";
import { randomDeck } from "@optcg/rules/src/sim/fuzz";

export function botGame(seed: number, level: "easy" | "normal" = "easy"): BotGameResult {
  const rng = createSeededRng(seed);
  return playBotGame({ seed, players: [randomDeck(rng), randomDeck(rng)], levels: [level, level] });
}

/** The first finished game with at least `minTurns` turns, searching upward from `from`. */
export function finishedGame(minTurns: number, from = 1): { replay: MatchReplay; result: BotGameResult } {
  for (let seed = from; seed < from + 60; seed += 1) {
    const result = botGame(seed);
    if (result.winner !== null && result.turns >= minTurns && result.replay.end) return { replay: result.replay, result };
  }
  throw new Error(`no finished game with ${minTurns} turns`);
}

/** Play legal moves until a Life card is taken as damage. */
export function gameWithLifeTaken(): { replay: MatchReplay; taken: Extract<GameEvent, { type: "life_taken" }> } {
  const players: MatchReplay["players"] = [
    { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) },
    { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) },
  ];
  const seed = 17;
  let state = skipMulligans(createMatch({ seed, firstSeat: 0, players: [{ ...players[0], deck: [...players[0].deck] }, { ...players[1], deck: [...players[1].deck] }] }));
  const intents: MatchReplay["intents"] = [];
  for (let i = 0; i < 500 && state.winner === null; i++) {
    const seat = (([0, 1] as Seat[]).find((s) => listLegalIntents(state, s).length > 0))!;
    const legal = listLegalIntents(state, seat);
    const intent =
      legal.find((x) => x.type.includes("attack")) ?? legal.find((x) => x.type.startsWith("pass")) ?? legal.find((x) => x.type === "end_turn") ?? legal[0]!;
    const result = applyIntent(state, intent, { seat });
    state = result.state;
    intents.push({ seat, intent });
    const taken = result.events.find((e): e is Extract<GameEvent, { type: "life_taken" }> => e.type === "life_taken");
    if (taken) {
      return {
        replay: { schema: MATCH_REPLAY_SCHEMA, rulesVersion: "t", registryHash: "t", seed, firstSeat: 0, skipMulligans: true, lifeCheckEveryHit: true, players, intents, end: { winner: (1 - taken.seat) as Seat, reason: "concede" } },
        taken,
      };
    }
  }
  throw new Error("no Life was taken");
}

let lifeGame: ReturnType<typeof gameWithLifeTaken> | undefined;
/** The same game for every caller in one test file: the replay and the Life card it takes. */
export const lifeTakenGame = () => (lifeGame ??= gameWithLifeTaken());

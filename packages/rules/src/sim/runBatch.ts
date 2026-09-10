import { buildTestDeck } from "../cards/definitions.js";
import {
  applyIntent,
  assertInvariants,
  createMatch,
  listLegalIntents,
  skipMulligans,
} from "../engine.js";
import { createSeededRng } from "../rng.js";
import type { MatchState, Seat } from "../types.js";

function actingSeat(state: MatchState): Seat {
  if (state.phase === "mulligan") {
    if (!state.players[0].mulliganDone) return 0;
    return 1;
  }
  if (state.pendingTrigger) return state.pendingTrigger.seat;
  if (state.phase === "block" || state.phase === "counter") {
    return state.battle ? (state.battle.attackerSeat === 0 ? 1 : 0) : state.activeSeat;
  }
  return state.activeSeat;
}

function playRandom(seed: number, maxIntents = 800): {
  finished: boolean;
  intents: number;
  winner: Seat | null;
} {
  const rng = createSeededRng(seed);
  const deck = buildTestDeck(20);
  let state = createMatch({
    seed,
    firstSeat: 0,
    players: [
      { leaderId: "ST01-001", deck: [...deck] },
      { leaderId: "ST01-001", deck: [...deck] },
    ],
  });
  state = skipMulligans(state, rng);

  let intents = 0;
  while (
    intents < maxIntents &&
    state.winner === null &&
    state.phase !== "game_over"
  ) {
    assertInvariants(state);
    const seat = actingSeat(state);
    const legal = listLegalIntents(state, seat);
    if (legal.length === 0) {
      throw new Error(`No legal intents seed=${seed} phase=${state.phase} seat=${seat}`);
    }
    const end = legal.find((i) => i.type === "end_turn");
    const pick =
      end && rng.next() < 0.25 ? end : legal[rng.nextInt(legal.length)]!;
    const r = applyIntent(state, pick, { seat, rng });
    if (!r.ok) {
      throw new Error(`Illegal pick ${JSON.stringify(pick)}: ${r.error?.message}`);
    }
    state = r.state;
    intents += 1;
  }
  return { finished: state.winner !== null, intents, winner: state.winner };
}

const games = Number(process.env.SIM_GAMES ?? 100);
let finished = 0;
for (let i = 0; i < games; i++) {
  const result = playRandom(1000 + i);
  if (result.finished) finished += 1;
}
console.log(`sim: ${games} games, ${finished} finished with a winner`);
if (finished < Math.floor(games * 0.3)) {
  console.error("Too few games finished — possible soft-lock");
  process.exit(1);
}

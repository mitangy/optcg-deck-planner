/** Fixtures for the puzzle tests (#677): Harness boards with cards whose numbers are known, so no bot or deck can shift a test. */
import { createSeededRng, type CardInstance } from "@optcg/rules";
import { Harness } from "@optcg/rules/src/testing/harness";

export const KAROO = "ST01-003"; // vanilla, cost 1, 3000, Counter 1000
export const VIVI = "ST01-009"; // vanilla, cost 2, 4000
export const BIG = "EB02-001"; // vanilla, cost 5, 7000, Counter 1000
export const ZORO_RUSH = "OP01-025"; // cost 3, 5000, [Rush]
export const LUFFY = "ST01-001"; // Leader, 5000
export const NEWGATE = "OP02-001"; // Leader, 6000
export const KAROO_LEADER = "OP18-001"; // Leader: its Animal + Alabasta Characters get +1000 power and [Rush]

/** Seat 0 is in its Main Phase on turn 3, Leaders Luffy (seat 0) and Newgate (seat 1) unless stated. */
export const board = (leaders: [string, string] = [LUFFY, NEWGATE]) => new Harness({ leaders });

/** A Character that entered this turn. */
export const justPlayed = (h: Harness, card: CardInstance): CardInstance => {
  card.summoningSick = true;
  card.playedTurn = h.state.turnNumber;
  return card;
};

export const rng = (seed = 1) => createSeededRng(seed);

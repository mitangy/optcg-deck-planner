import { createSeededRng, type CardInstance } from "@optcg/rules";
import { Harness } from "@optcg/rules/src/testing/harness";

export const KAROO = "ST01-003";
export const VIVI = "ST01-009";
export const BIG = "EB02-001";
export const ZORO_RUSH = "OP01-025";
export const LUFFY = "ST01-001";
export const NEWGATE = "OP02-001";
export const KAROO_LEADER = "OP18-001";

export const board = (leaders: [string, string] = [LUFFY, NEWGATE]) => new Harness({ leaders });

export const justPlayed = (h: Harness, card: CardInstance): CardInstance => {
  card.summoningSick = true;
  card.playedTurn = h.state.turnNumber;
  return card;
};

export const rng = (seed = 1) => createSeededRng(seed);

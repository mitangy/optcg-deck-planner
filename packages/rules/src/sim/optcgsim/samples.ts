/**
 * OPTCGSim games as value-model training samples (#1030).
 *
 * `samplesFromSimGame` turns every turn snapshot of a parsed sim game into one `Sample` (the same shape
 * `samplesFromReplay` produces in sim/fitValue.ts) by building a synthetic MatchState and running the bot's own
 * `extractFeatures` / `evaluate` on it. Pure: no I/O.
 *
 * Only the recording player (`me`) is sampled, labelled with whether `me` won. We know `me`'s hand ids; the
 * opponent's hand is a COUNT only (their face-down draws are not knowable from the recording player's seat, and the
 * features never read the opponent's hand contents anyway). Sampling the opponent's seat would train on a view
 * nobody could have had. `samplesFromReplay` samples both seats; that difference halves the sim yield per game.
 *
 * Feature gaps against replay samples (stand-ins, all neutral):
 *  - Life cards are an unknown vanilla filler and face-down (`faceup_*` is always 0; the life counts are exact).
 *  - The opponent's hand and both decks are filler cards; only the counts are real.
 *  - Leader power carries no sim buff (`powerDelta` is only recorded for characters).
 *  - Character power is base + the logged delta; static abilities of the card defs still apply as in the engine.
 *  - Samples are taken at the start of each turn (after refresh/draw/DON), as samplesFromReplay does, but the last
 *    turn of a game that ends mid-turn is still sampled (a replay skips positions that already have a winner).
 */
import { createMatch } from "../../engine.js";
import { getCardDef, hasCardDef } from "../../cards/definitions.js";
import { cardBag, denseFeaturesV2, extractFeatures } from "../../bot/features.js";
import type { FeatureSet } from "../../bot/valueModel.js";
import { evaluate } from "../../bot/evaluate.js";
import type { CardInstance, DonInstance, MatchState, PlayerState, Seat } from "../../types.js";
import type { CardTable, Sample } from "../fitValue.js";
import type { SimBoardSnapshot, SimGame, SimSide } from "./types.js";

/** Vanilla filler used for every card whose identity is unknown or irrelevant (same as the test harness). */
const FILLER = "ST01-003";
const ME: Seat = 0;
const OPP: Seat = 1;
const seatOf = (side: SimSide): Seat => (side === "me" ? ME : OPP);

/** Every card id the synthetic states would reference. */
function boardIds(b: SimBoardSnapshot): string[] {
  return [...b.characters.map((c) => c.id), ...(b.stage ? [b.stage] : []), ...b.knownHandIds, ...b.trashIds];
}

/** True when every card the game's snapshots mention has a card definition (and both leaders are Leaders). */
export function simGameIsKnown(game: SimGame): boolean {
  for (const t of game.turns) {
    for (const side of ["me", "opp"] as const) {
      const b = t.snapshot[side];
      if (!b.leader.id || !hasCardDef(b.leader.id) || getCardDef(b.leader.id).type !== "leader") return false;
      if (!boardIds(b).every((id) => hasCardDef(id))) return false;
    }
  }
  return true;
}

let seq = 0;
const nextId = (prefix: string): string => `${prefix}_sim${(seq += 1)}`;

const card = (defId: string, extra: Partial<CardInstance> = {}): CardInstance => ({ id: nextId("c"), defId, rested: false, attachedDonIds: [], ...extra });

function fillBoard(state: MatchState, seat: Seat, b: SimBoardSnapshot, turnsStarted: number, handIds: string[]): void {
  const p: PlayerState = state.players[seat];
  p.leader = card(b.leader.id!, { rested: b.leader.rested });
  p.characters = b.characters.map((ch) => {
    const c = card(ch.id, { rested: ch.rested, playedTurn: 0 });
    if (ch.powerDelta !== 0) state.modifiers.push({ id: nextId("m"), sourceSeat: seat, target: { kind: "card", id: c.id }, effect: { type: "power", amount: ch.powerDelta }, expires: { kind: "permanent" } });
    return c;
  });
  p.stage = b.stage ? card(b.stage, { playedTurn: 0 }) : null;
  p.hand = handIds.map((id) => card(id));
  // Zones whose contents are unknown: filler of the right size.
  p.deck = Array.from({ length: b.deckCount }, () => FILLER);
  p.zoneInstanceIds.deck = p.deck.map(() => nextId("d"));
  p.trash = [...b.trashIds];
  p.zoneInstanceIds.trash = p.trash.map(() => nextId("t"));
  p.life = Array.from({ length: b.lifeCount }, () => FILLER);
  p.zoneInstanceIds.life = p.life.map(() => nextId("l"));
  p.faceUpLife = p.life.map(() => false);
  p.resolving = [];
  // DON!!: cost area (active/rested), attached to the leader and characters, the rest in the DON!! deck.
  const don = (rested: boolean, attachedTo: string | null = null): DonInstance => ({ id: nextId("don"), rested, attachedTo });
  p.costArea = [...Array.from({ length: b.donActive }, () => don(false)), ...Array.from({ length: b.donRested }, () => don(true))];
  p.attachedDons = [];
  const attach = (target: CardInstance, n: number): void => {
    for (let i = 0; i < n; i += 1) {
      const d = don(false, target.id);
      target.attachedDonIds.push(d.id);
      p.attachedDons.push(d);
    }
  };
  attach(p.leader, b.leader.attachedDon);
  p.characters.forEach((c, i) => attach(c, b.characters[i]!.attachedDon));
  p.donDeck = Array.from({ length: b.donDeckCount }, () => don(false));
  p.mulliganDone = true;
  p.turnsStarted = turnsStarted;
}

/** One sample per turn of a parsed sim game, from the recording player's seat. [] for games with no winner or an unknown card id. */
export function samplesFromSimGame(game: SimGame, gameIndex: number, featureSet: FeatureSet = "v1", table?: CardTable): Sample[] {
  if (featureSet === "v2" && !table) throw new Error("feature set v2 needs a CardTable");
  if (!game.winner || !simGameIsKnown(game)) return [];
  const y: 0 | 1 = game.winner === "me" ? 1 : 0;
  const started = { me: 0, opp: 0 };
  const out: Sample[] = [];
  for (const turn of game.turns) {
    started[turn.active] += 1;
    const { me, opp } = turn.snapshot;
    const state = createMatch({
      seed: 1,
      firstSeat: seatOf(game.firstPlayer),
      players: [
        { leaderId: me.leader.id!, deck: Array.from({ length: 50 }, () => FILLER) },
        { leaderId: opp.leader.id!, deck: Array.from({ length: 50 }, () => FILLER) },
      ],
    });
    state.phase = "main";
    state.pendingChoices = [];
    state.turnNumber = turn.number;
    state.activeSeat = seatOf(turn.active);
    fillBoard(state, ME, me, started.me, me.knownHandIds);
    // The opponent's hand is a count of unknown cards.
    fillBoard(state, OPP, opp, started.opp, Array.from({ length: opp.handCount }, () => FILLER));
    const row: Sample = { x: featureSet === "v2" ? denseFeaturesV2(state, ME) : extractFeatures(state, ME), y, hand: evaluate(state, ME), turn: turn.number, game: gameIndex };
    if (featureSet === "v2") {
      // The card bag reads only my own hand ids (known) and both boards; the opponent hand stays filler.
      const bag = cardBag(state, ME, table!.lookup);
      row.sp = bag.idx.flatMap((k, i) => [k, bag.val[i]!]);
    }
    out.push(row);
  }
  return out;
}

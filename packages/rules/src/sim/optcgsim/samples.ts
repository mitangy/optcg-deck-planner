import { createMatch } from "../../engine.js";
import { getCardDef, hasCardDef } from "../../cards/definitions.js";
import { cardBag, denseFeaturesV2, extractFeatures } from "../../bot/features.js";
import type { FeatureSet } from "../../bot/valueModel.js";
import { evaluate } from "../../bot/evaluate.js";
import type { CardInstance, DonInstance, MatchState, PlayerState, Seat } from "../../types.js";
import type { CardTable, Sample } from "../fitValue.js";
import type { SimBoardSnapshot, SimGame, SimSide } from "./types.js";

const FILLER = "ST01-003";
const ME: Seat = 0;
const OPP: Seat = 1;
const seatOf = (side: SimSide): Seat => (side === "me" ? ME : OPP);

function boardIds(b: SimBoardSnapshot): string[] {
  return [...b.characters.map((c) => c.id), ...(b.stage ? [b.stage] : []), ...b.knownHandIds, ...b.trashIds];
}

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
  p.deck = Array.from({ length: b.deckCount }, () => FILLER);
  p.zoneInstanceIds.deck = p.deck.map(() => nextId("d"));
  p.trash = [...b.trashIds];
  p.zoneInstanceIds.trash = p.trash.map(() => nextId("t"));
  p.life = Array.from({ length: b.lifeCount }, () => FILLER);
  p.zoneInstanceIds.life = p.life.map(() => nextId("l"));
  p.faceUpLife = p.life.map(() => false);
  p.resolving = [];
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
    fillBoard(state, OPP, opp, started.opp, Array.from({ length: opp.handCount }, () => FILLER));
    const row: Sample = { x: featureSet === "v2" ? denseFeaturesV2(state, ME) : extractFeatures(state, ME), y, hand: evaluate(state, ME), turn: turn.number, game: gameIndex };
    if (featureSet === "v2") {
      const bag = cardBag(state, ME, table!.lookup);
      row.sp = bag.idx.flatMap((k, i) => [k, bag.val[i]!]);
    }
    out.push(row);
  }
  return out;
}

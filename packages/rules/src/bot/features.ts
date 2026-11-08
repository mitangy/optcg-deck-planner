/**
 * Position features for the learned value model (#635). Pure: reads a full MatchState, but only what `seat` could see
 * (the opponent's hand counts by size, never by content), so the same features work on a determinized copy.
 * The vector is fixed-length; `FEATURE_NAMES` names each slot and `valueWeights.json` is fitted against exactly this order.
 */
import { getCardDef } from "../cards/definitions.js";
import { hasPrintedKeyword } from "../cards/abilities.js";
import { evaluate } from "./evaluate.js";
import { keywordsOf, powerOf, withQueryCache } from "../engine/queries.js";
import type { MatchState, PlayerState, Seat } from "../types.js";

/** One side of the table, summarised. Hand contents are summarised only for the seat the features are built for. */
interface Side {
  life: number;
  faceUpLife: number;
  hand: number;
  counterPower: number;
  counterEvents: number;
  handCost: number;
  donField: number;
  donActive: number;
  donAttached: number;
  chars: number;
  charPower: number;
  charCost: number;
  blockersActive: number;
  rested: number;
  stage: number;
  deck: number;
  trash: number;
  leaderPower: number;
  turnsStarted: number;
}

function side(state: MatchState, seat: Seat, p: PlayerState, ownHand: boolean): Side {
  let counterPower = 0;
  let counterEvents = 0;
  let handCost = 0;
  if (ownHand) {
    for (const c of p.hand) {
      const def = getCardDef(c.defId);
      handCost += def.cost;
      if (def.type === "character" && def.counter) counterPower += def.counter;
      if (def.type === "event" && def.eventTiming === "counter") counterEvents += 1;
    }
  }
  let charPower = 0;
  let charCost = 0;
  let blockersActive = 0;
  let rested = 0;
  for (const c of p.characters) {
    const def = getCardDef(c.defId);
    charPower += powerOf(state, seat, c);
    charCost += def.cost;
    if (c.rested) rested += 1;
    else if (hasPrintedKeyword(c.defId, "blocker") || keywordsOf(state, seat, c).has("blocker")) blockersActive += 1;
  }
  return {
    life: p.life.length,
    faceUpLife: p.faceUpLife.filter((up, i) => up && i < p.life.length).length,
    hand: p.hand.length,
    counterPower, counterEvents, handCost,
    donField: p.costArea.length + p.attachedDons.length,
    donActive: p.costArea.filter((d) => !d.rested).length,
    donAttached: p.attachedDons.length,
    chars: p.characters.length,
    charPower, charCost, blockersActive, rested,
    stage: p.stage ? 1 : 0,
    deck: p.deck.length,
    trash: p.trash.length,
    leaderPower: powerOf(state, seat, p.leader),
    turnsStarted: p.turnsStarted,
  };
}

export const FEATURE_NAMES = [
  "life_me", "life_opp", "life_diff", "me_last_life", "opp_last_life", "opp_life_le2", "me_life_le2",
  "faceup_me", "faceup_opp",
  "hand_me", "hand_opp", "hand_diff", "counter_power_me", "counter_events_me", "hand_cost_me",
  "don_me", "don_opp", "don_active_me", "don_attached_me", "don_attached_opp",
  "chars_me", "chars_opp", "char_power_me", "char_power_opp", "char_cost_me", "char_cost_opp",
  "blockers_me", "blockers_opp", "rested_me", "rested_opp", "stage_me", "stage_opp",
  "deck_me", "deck_opp", "trash_me", "trash_opp",
  "leader_power_diff", "turn", "my_turn", "turns_started_diff", "my_turn_x_don_active", "life_diff_x_late", "board_power_diff", "tempo",
  "hand_eval",
] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];

/** The feature vector of `state` for `seat` (aligned with FEATURE_NAMES). Not meaningful once the game is over. */
export function extractFeatures(state: MatchState, seat: Seat): number[] {
  return withQueryCache(state, () => {
    const oppSeat: Seat = seat === 0 ? 1 : 0;
    return v1Vector(state, seat, side(state, seat, state.players[seat], true), side(state, oppSeat, state.players[oppSeat], false));
  });
}

function v1Vector(state: MatchState, seat: Seat, me: Side, op: Side): number[] {
  const myTurn = state.activeSeat === seat ? 1 : 0;
  const late = Math.min(1, Math.max(0, (state.turnNumber - 4) / 8));
  const boardDiff = (me.charPower - op.charPower) / 10000;
  return [
    me.life / 5, op.life / 5, (me.life - op.life) / 5, me.life === 0 ? 1 : 0, op.life === 0 ? 1 : 0, op.life <= 2 ? 1 : 0, me.life <= 2 ? 1 : 0,
    me.faceUpLife / 5, op.faceUpLife / 5,
    me.hand / 7, op.hand / 7, (me.hand - op.hand) / 7, me.counterPower / 10000, me.counterEvents / 3, me.handCost / 20,
    me.donField / 10, op.donField / 10, me.donActive / 10, me.donAttached / 10, op.donAttached / 10,
    me.chars / 5, op.chars / 5, me.charPower / 30000, op.charPower / 30000, me.charCost / 20, op.charCost / 20,
    me.blockersActive / 3, op.blockersActive / 3, me.rested / 5, op.rested / 5, me.stage, op.stage,
    me.deck / 50, op.deck / 50, me.trash / 30, op.trash / 30,
    (me.leaderPower - op.leaderPower) / 5000, state.turnNumber / 10, myTurn, (me.turnsStarted - op.turnsStarted),
    myTurn * me.donActive / 10, ((me.life - op.life) / 5) * late, boardDiff, (me.donField - op.donField) / 10 * (me.chars - op.chars) / 5,
    // The hand-tuned score (in cards) is a feature too: the fit starts from it and only corrects what it gets wrong.
    evaluate(state, seat) / 10,
  ];
}

// --- feature set v2 -----------------------------------------------------------------------------------------------

/** Leader colours as they appear in the card data. */
export const LEADER_COLORS = ["red", "green", "blue", "purple", "black", "yellow"] as const;

/** v1 slots the "my leader colour x ..." interactions scale (same scaling as v1). */
const COLOR_INTERACTIONS = ["life_diff", "hand_diff", "board_power_diff"] as const;
const V1_INDEX: Record<string, number> = Object.fromEntries(FEATURE_NAMES.map((n, i) => [n, i]));

/** Dense part of feature set v2: every v1 feature (same order), then the additions. The card bag is sparse and lives beside it. */
export const FEATURE_NAMES_V2 = [
  ...FEATURE_NAMES,
  ...LEADER_COLORS.map((c) => `leader_me_${c}`),
  ...LEADER_COLORS.map((c) => `leader_opp_${c}`),
  ...LEADER_COLORS.flatMap((c) => COLOR_INTERACTIONS.map((f) => `leader_me_${c}_x_${f}`)),
  "opp_don_next", "ready_attackers_me", "ready_power_me", "lethal_attackers_me", "ready_attackers_opp", "lethal_attackers_opp", "counter_per_attack_opp",
] as const;

/** Sparse card-identity inputs: slot = 2 * vocabIndex + (0: my field count minus theirs, 1: copies in my hand). */
export const BAG_SLOTS = 2;

export interface FeaturesV2 {
  /** Aligned with FEATURE_NAMES_V2. */
  dense: number[];
  /** Nonzero bag slots (see BAG_SLOTS) and their values; parallel arrays, at most one entry per slot. */
  idx: number[];
  val: number[];
}

/** Units of `p` that can attack at the next opportunity (the Leader and unrested Characters not summoning-sick on their own turn), with the number that reach `against` power. */
function attackers(state: MatchState, seat: Seat, against: number): { n: number; power: number; reach: number } {
  const p = state.players[seat];
  let n = 0;
  let power = 0;
  let reach = 0;
  const count = (c: typeof p.leader, canAct: boolean): void => {
    if (c.rested || !canAct) return;
    const pw = powerOf(state, seat, c);
    n += 1;
    power += pw;
    if (pw >= against) reach += 1;
  };
  count(p.leader, true);
  for (const c of p.characters) count(c, !(c.summoningSick && state.activeSeat === seat));
  return { n, power, reach };
}

/**
 * Card-identity bag of `seat`'s view: for every card `lookup` knows (returns an index, or -1 to skip), my field count minus
 * the opponent's (Characters and Stage) and the copies in MY hand. The opponent's hand is never read.
 */
export function cardBag(state: MatchState, seat: Seat, lookup: (defId: string) => number): { idx: number[]; val: number[] } {
  const idx: number[] = [];
  const val: number[] = [];
  const add = (defId: string, slot: number, v: number): void => {
    const card = lookup(defId);
    if (card < 0) return;
    const key = card * BAG_SLOTS + slot;
    const at = idx.indexOf(key);
    if (at >= 0) val[at]! += v;
    else { idx.push(key); val.push(v); }
  };
  const me = state.players[seat];
  const op = state.players[seat === 0 ? 1 : 0];
  for (const c of me.characters) add(c.defId, 0, 1);
  if (me.stage) add(me.stage.defId, 0, 1);
  for (const c of op.characters) add(c.defId, 0, -1);
  if (op.stage) add(op.stage.defId, 0, -1);
  for (const c of me.hand) add(c.defId, 1, 1);
  // A card on both fields in equal number cancels to zero: drop those so the list is the nonzero entries only.
  for (let i = idx.length - 1; i >= 0; i -= 1) if (val[i] === 0) { idx.splice(i, 1); val.splice(i, 1); }
  return { idx, val };
}

const vocabIndexes = new WeakMap<readonly string[], Map<string, number>>();
function vocabLookup(vocab: readonly string[]): (defId: string) => number {
  let m = vocabIndexes.get(vocab);
  if (!m) { m = new Map(vocab.map((id, i) => [id, i])); vocabIndexes.set(vocab, m); }
  const map = m;
  return (defId) => map.get(defId) ?? -1;
}

/** The dense part of feature set v2 for `seat`. */
export function denseFeaturesV2(state: MatchState, seat: Seat): number[] {
  return withQueryCache(state, () => {
    const oppSeat: Seat = seat === 0 ? 1 : 0;
    const me = side(state, seat, state.players[seat], true);
    const op = side(state, oppSeat, state.players[oppSeat], false);
    const x = v1Vector(state, seat, me, op);
    const myColors = getCardDef(state.players[seat].leader.defId).colors;
    const oppColors = getCardDef(state.players[oppSeat].leader.defId).colors;
    for (const c of LEADER_COLORS) x.push(myColors.includes(c) ? 1 : 0);
    for (const c of LEADER_COLORS) x.push(oppColors.includes(c) ? 1 : 0);
    for (const c of LEADER_COLORS) for (const f of COLOR_INTERACTIONS) x.push(myColors.includes(c) ? x[V1_INDEX[f]!]! : 0);
    const mine = attackers(state, seat, op.leaderPower);
    const theirs = attackers(state, oppSeat, me.leaderPower);
    x.push(
      Math.min(10, op.donField + 2) / 10,
      mine.n / 6, mine.power / 30000, mine.reach / 5,
      theirs.n / 6, theirs.reach / 5,
      // Hand counter value (in 10k) per attack the opponent can make.
      me.counterPower / 10000 / Math.max(1, theirs.n),
    );
    return x;
  });
}

/** Feature set v2 of `state` for `seat`; the card bag is indexed by `vocab` (cards outside it are ignored, no vocab = no bag). */
export function extractFeaturesV2(state: MatchState, seat: Seat, vocab?: readonly string[]): FeaturesV2 {
  const dense = denseFeaturesV2(state, seat);
  if (!vocab || vocab.length === 0) return { dense, idx: [], val: [] };
  return { dense, ...cardBag(state, seat, vocabLookup(vocab)) };
}

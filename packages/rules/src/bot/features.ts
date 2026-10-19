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
    const me = side(state, seat, state.players[seat], true);
    const op = side(state, oppSeat, state.players[oppSeat], false);
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
  });
}

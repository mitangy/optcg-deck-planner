/**
 * Position evaluation for the hard bot's lookahead (#631). Pure; reads a full MatchState (a determinized one in
 * practice) and returns a score from `seat`'s point of view in "cards": +1 is about one extra card in hand.
 *
 * Every weight lives in EVAL_WEIGHTS so the whole model can be read, tuned and tested in one place.
 */
import { getCardDef } from "../cards/definitions.js";
import { hasPrintedKeyword } from "../cards/abilities.js";
import { keywordsOf, withQueryCache } from "../engine/queries.js";
import type { CardInstance, MatchState, PlayerState, Seat } from "../types.js";

export const EVAL_WEIGHTS = {
  /** A finished game dwarfs every other term; earlier wins score slightly higher. */
  win: 1000,
  winPerSpareTurn: 2,
  /** Marginal worth of the 1st (last), 2nd, 3rd ... Life card to its owner. The last Life card is worth the most. */
  life: [3.2, 2.3, 1.7, 1.3, 1.1],
  lifeBeyond: 1.0,
  /** Opponent Life is worth a little less than ours (we do not control when it falls). */
  opponentLifeFactor: 0.9,
  /** A Life card that is still face-down hides its [Trigger] from the other player. */
  faceDownLife: 0.15,
  /** DON!! on the field (cost area + attached). Ramp has value until both players would reach 10 anyway. */
  don: 0.6,
  /** The DON!! term fades by this much per turn the owner has started, down to `donFloor` of its value. */
  donFadePerTurn: 0.12,
  donFloor: 0.2,
  /** A card in hand: base, plus Counter value per 1000, plus a Counter Event bonus. */
  hand: 1.0,
  handPerCounter1000: 0.2,
  handCounterEvent: 0.3,
  handPerCost: 0.03,
  /** Opponent hand cards are worth slightly less to the opponent than ours are to us. */
  opponentHandFactor: 0.9,
  /** Character on board: base + per cost + per 1000 power; Blockers more when untapped (a rested Blocker cannot block). */
  character: 0.7,
  characterPerCost: 0.28,
  characterPerPower1000: 0.08,
  blockerActive: 1.0,
  blockerRested: 0.2,
  stage: 0.5,
  stagePerCost: 0.3,
  /** Deck-out risk: below this many cards in the deck, every missing card costs `deckOutPerCard`. */
  deckOutBelow: 4,
  deckOutPerCard: 3,
} as const;

const W = EVAL_WEIGHTS;

function lifeValue(count: number): number {
  let v = 0;
  for (let i = 0; i < count; i += 1) v += W.life[i] ?? W.lifeBeyond;
  return v;
}

function handValue(defId: string): number {
  const def = getCardDef(defId);
  let v = W.hand + def.cost * W.handPerCost;
  if (def.type === "character" && def.counter) v += (def.counter / 1000) * W.handPerCounter1000;
  if (def.type === "event" && def.eventTiming === "counter") v += W.handCounterEvent;
  return v;
}

function characterValue(state: MatchState, seat: Seat, c: CardInstance): number {
  const def = getCardDef(c.defId);
  let v = W.character + def.cost * W.characterPerCost + ((def.power ?? 0) / 1000) * W.characterPerPower1000;
  const blocker = hasPrintedKeyword(c.defId, "blocker") || keywordsOf(state, seat, c).has("blocker");
  if (blocker) v += c.rested ? W.blockerRested : W.blockerActive;
  return v;
}

/** What one player's side of the table is worth to that player. */
function sideValue(state: MatchState, seat: Seat, p: PlayerState, handFactor: number, lifeFactor: number): number {
  let v = 0;
  const lifeCount = p.life.length;
  v += lifeValue(lifeCount) * lifeFactor;
  v += p.faceUpLife.filter((up, i) => !up && i < lifeCount).length * W.faceDownLife * lifeFactor;
  const donOnField = p.costArea.length + p.attachedDons.length;
  v += donOnField * W.don * Math.max(W.donFloor, 1 - W.donFadePerTurn * Math.max(0, p.turnsStarted - 1));
  v += p.hand.reduce((n, c) => n + handValue(c.defId), 0) * handFactor;
  for (const c of p.characters) v += characterValue(state, seat, c);
  if (p.stage) v += W.stage + getCardDef(p.stage.defId).cost * W.stagePerCost;
  if (p.deck.length < W.deckOutBelow) v -= (W.deckOutBelow - p.deck.length) * W.deckOutPerCard;
  return v;
}

/** Score of `state` for `seat`: own side minus the opponent's, or a large win/loss once the game is over. */
export function evaluate(state: MatchState, seat: Seat, startTurn = state.turnNumber): number {
  if (state.winner !== null) {
    const spare = Math.max(0, 40 - (state.turnNumber - startTurn)) * W.winPerSpareTurn;
    return state.winner === seat ? W.win + spare : -W.win - spare;
  }
  return withQueryCache(state, () => {
    const me = sideValue(state, seat, state.players[seat], 1, 1);
    const opp = state.players[seat === 0 ? 1 : 0];
    // The opponent's hand is counted by size only: its contents are hidden from the bot.
    const oppSeat: Seat = seat === 0 ? 1 : 0;
    const theirs = sideValue(state, oppSeat, { ...opp, hand: [] }, 0, W.opponentLifeFactor) + opp.hand.length * W.hand * W.opponentHandFactor;
    return me - theirs;
  });
}

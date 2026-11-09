/**
 * OP13-001 Monkey.D.Luffy. [DON!! x1][On Your Opponent's Attack] if I have 5 or less active DON!!: rest any number of active
 * DON!!, the Leader or a {Straw Hat Crew} Character gets +2000 per DON!! rested this battle. Needs (1) an attached DON!!
 * (given in my turn it stays on the Leader through the opponent's turn) and (2) a sensible amount rested: the fewest that make the attacked card out-power the attacker (a tie
 * loses), all of them when even that is not enough. Prompts: first the DON!! select ("_d"), then the power target.
 * Hints 1, 3 and 5 (#1204) come from optcgwebsim.com/learn/miracle-luffy-eb05-guide.
 */
import { getCardDef } from "../../cards/definitions.js";
import type { Intent, PendingChoice } from "../../types.js";
import type { BotView } from "../types.js";
import { findBoardCard } from "../value.js";
import { giveLeaderFirstDon, handDefIds } from "./common.js";
import type { LeaderPlaybook } from "./types.js";

// Holding active DON!! back for this defense was tried and lost games (1000 paired Normal games: hold 2 -> 43.5%, hold 1 -> 47.5%,
// none -> 53.3%), so the playbook spends DON!! normally (#1178).
const BOOST = 2000;

// Guide hints (#1204, optcgwebsim.com/learn/miracle-luffy-eb05-guide).
const GARP = "OP13-016";
const BONNEY = "EB05-001";
const ONE_COSTS = ["OP07-022", "ST30-004", "OP13-016"];
/** Hint 3: the three rest-based cards, and the cards that go with them. */
const REST_CARDS = ["OP06-036", "OP06-033", "OP08-036"];
const REST_FOLLOW_UPS = ["OP14-031", "OP17-022"];
/** Hint 3: size of the penalty for a rest card with nothing to hit, and the bonus for OP08-036 with two or more rested targets. */
export const LUFFY13_NO_TARGET_PENALTY = 3;
export const LUFFY13_MANY_TARGETS_BONUS = 2;
/** Hint 3: rested opposing Characters at which OP08-036 gets its bonus. */
export const LUFFY13_MANY_TARGETS = 2;
/** Hint 5: ST30-004 bonus when this many rest-based cards are in hand. */
export const LUFFY13_ST30_BONUS = 2;
export const LUFFY13_ST30_MIN_PARTNERS = 2;
const ST30_PARTNERS = ["OP06-036", "OP12-023", "ST32-002", "OP13-031"];

/** The card under attack and the attacker's power, when I am defending. */
function battleOf(view: BotView) {
  const b = view.battle;
  if (!b || b.attackerSeat === view.seat) return null;
  const attacker = findBoardCard(view, b.attackerId)?.card;
  const target = b.target.kind === "leader" ? view.you.leader : view.you.characters.find((c) => c.id === (b.target as { instanceId: string }).instanceId);
  return attacker && target ? { attacker, target } : null;
}

export const luffy13Playbook: LeaderPlaybook = {
  leaderId: "OP13-001",
  name: "Monkey.D.Luffy (OP13)",
  beforeEndTurn: giveLeaderFirstDon,
  /**
   * Hint 1, mulligan (#1204): keep with both Garp and Bonney, or with one of them plus another 1-cost opener; otherwise mulligan
   * when neither is there. Anything else keeps the generic rule.
   */
  mulligan(hand): "keep" | "mulligan" | undefined {
    const g = hand.includes(GARP), b = hand.includes(BONNEY);
    if (g && b) return "keep";
    if (!g && !b) return "mulligan";
    const others = [...hand];
    others.splice(others.indexOf(g ? GARP : BONNEY), 1);
    return others.some((id) => ONE_COSTS.includes(id)) ? "keep" : undefined;
  },
  playBonus(view: BotView, defId: string): number {
    let b = 0;
    const hand = handDefIds(view);
    const rested = view.opponent.characters.filter((c) => c.rested);
    // Hint 3, rest-based cards (#1204): hold them while there is nothing rested to hit, push OP08-036 when two or more are, and
    // play the cards that follow them a little earlier when one is in hand.
    if (defId === "OP06-036" && !rested.some((c) => c.fieldCost <= 4)) b -= LUFFY13_NO_TARGET_PENALTY;
    if (defId === "OP06-033" && rested.length === 0) b -= LUFFY13_NO_TARGET_PENALTY;
    if (defId === "OP08-036") b += rested.length === 0 ? -LUFFY13_NO_TARGET_PENALTY : rested.length >= LUFFY13_MANY_TARGETS ? LUFFY13_MANY_TARGETS_BONUS : 0;
    if (REST_FOLLOW_UPS.includes(defId) && hand.some((id) => REST_CARDS.includes(id))) b += 1;
    // Hint 5, ST30-004 (#1204): worth more with two or more of its partners in hand.
    if (defId === "ST30-004" && hand.filter((id) => ST30_PARTNERS.includes(id)).length >= LUFFY13_ST30_MIN_PARTNERS) b += LUFFY13_ST30_BONUS;
    return b;
  },
  answerChoice(view: BotView, choice: PendingChoice): Intent | undefined {
    const r = choice.request;
    const battle = battleOf(view);
    if (r?.type !== "select" || !battle) return undefined;
    const pick = (ids: string[]): Intent => ({ type: "resolve_pending_choice", accept: true, selectedOptionIds: ids });
    if (r.options.every((o) => o.zone === "don")) {
      const rest = r.options.filter((o) => o.eligible);
      // Only the Leader and {Straw Hat Crew} Characters can take the boost: for any other attacked card resting DON!! is a waste.
      if (battle.target.id !== view.you.leader.id && !(getCardDef(battle.target.defId).traits ?? []).includes("Straw Hat Crew")) return pick([]);
      const need = Math.max(0, Math.floor((battle.attacker.power - battle.target.power) / BOOST) + 1);
      return pick(rest.slice(0, Math.min(need, r.max, rest.length)).map((o) => o.id));
    }
    const target = r.options.find((o) => o.eligible && o.instanceId === battle.target.id);
    return pick(target ? [target.id] : []);
  },
};

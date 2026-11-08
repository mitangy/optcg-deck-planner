/**
 * OP13-001 Monkey.D.Luffy. [DON!! x1][On Your Opponent's Attack] if I have 5 or less active DON!!: rest any number of active
 * DON!!, the Leader or a {Straw Hat Crew} Character gets +2000 per DON!! rested this battle. Needs (1) an attached DON!!
 * (given in my turn it stays on the Leader through the opponent's turn) and (2) a sensible amount rested: the fewest that make the attacked card out-power the attacker (a tie
 * loses), all of them when even that is not enough. Prompts: first the DON!! select ("_d"), then the power target.
 */
import { getCardDef } from "../../cards/definitions.js";
import type { Intent, PendingChoice } from "../../types.js";
import type { BotView } from "../types.js";
import { findBoardCard } from "../value.js";
import { giveLeaderFirstDon } from "./common.js";
import type { LeaderPlaybook } from "./types.js";

// Holding active DON!! back for this defense was tried and lost games (1000 paired Normal games: hold 2 -> 43.5%, hold 1 -> 47.5%,
// none -> 53.3%), so the playbook spends DON!! normally (#1178).
const BOOST = 2000;

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

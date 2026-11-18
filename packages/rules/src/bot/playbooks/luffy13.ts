import { getCardDef } from "../../cards/definitions.js";
import type { Intent, PendingChoice } from "../../types.js";
import type { BotView } from "../types.js";
import { findBoardCard } from "../value.js";
import { giveLeaderFirstDon, handDefIds } from "./common.js";
import type { LeaderPlaybook } from "./types.js";

// Holding active DON!! back for this defense lost games in paired Normal games (1000 games: hold 2 -> 43.5%, hold 1 ->
// 47.5%, none -> 53.3%), so DON!! is spent normally.
const BOOST = 2000;

const GARP = "OP13-016";
const BONNEY = "EB05-001";
const ONE_COSTS = ["OP07-022", "ST30-004", "OP13-016"];
const REST_CARDS = ["OP06-036", "OP06-033", "OP08-036"];
const REST_FOLLOW_UPS = ["OP14-031", "OP17-022"];
export const LUFFY13_NO_TARGET_PENALTY = 3;
export const LUFFY13_MANY_TARGETS_BONUS = 2;
export const LUFFY13_MANY_TARGETS = 2;
export const LUFFY13_ST30_BONUS = 2;
export const LUFFY13_ST30_MIN_PARTNERS = 2;
const ST30_PARTNERS = ["OP06-036", "OP12-023", "ST32-002", "OP13-031"];

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
    if (defId === "OP06-036" && !rested.some((c) => c.fieldCost <= 4)) b -= LUFFY13_NO_TARGET_PENALTY;
    if (defId === "OP06-033" && rested.length === 0) b -= LUFFY13_NO_TARGET_PENALTY;
    if (defId === "OP08-036") b += rested.length === 0 ? -LUFFY13_NO_TARGET_PENALTY : rested.length >= LUFFY13_MANY_TARGETS ? LUFFY13_MANY_TARGETS_BONUS : 0;
    if (REST_FOLLOW_UPS.includes(defId) && hand.some((id) => REST_CARDS.includes(id))) b += 1;
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

import type { Intent } from "../../types.js";
import type { BotView } from "../types.js";

/** Its [DON!! x1] text needs one, and attached DON!! stays through the opponent's turn. */
export function giveLeaderFirstDon(view: BotView): Intent | undefined {
  if (view.you.leader.attachedDonCount > 0) return undefined;
  return view.legalIntents.find((i) => i.type === "give_don" && i.targetId === view.you.leader.id);
}

export const handDefIds = (view: BotView): string[] => view.you.hand.map((c) => c.defId);

export const costAreaDon = (view: BotView): number => view.you.costArea.length;

import type { Intent } from "../../types.js";
import type { BotView } from "../types.js";

/** A give_don of one DON!! to the Leader when it has none (its [DON!! x1] text needs one, and attached DON!! stays through the opponent's turn), else undefined. */
export function giveLeaderFirstDon(view: BotView): Intent | undefined {
  if (view.you.leader.attachedDonCount > 0) return undefined;
  return view.legalIntents.find((i) => i.type === "give_don" && i.targetId === view.you.leader.id);
}

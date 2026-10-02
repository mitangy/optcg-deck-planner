import type { Intent } from "../net/protocol";

/** The slice of a board card `cantAttackReason` reads. */
export type AttackBlockCard = {
  id: string;
  rested?: boolean;
  summoningSick?: boolean;
  statusLabels?: string[];
};

export type AttackBlockContext = {
  /** `view.phase`; only "main" can declare attacks. */
  phase: string;
  /** A battle or a prompt is open: the missing attack is not about this card. */
  busy: boolean;
  /** Your turns started so far (the first one can't attack). */
  turnsStarted?: number;
  intents: readonly Intent[];
};

/**
 * Why this Leader / Character of yours can't attack right now, for the warning
 * shown when the player tries anyway. Null when it can attack (the server
 * listed a declare_attack for it) or when the question doesn't apply (not your
 * main phase, a battle or prompt is open): then no warning is due.
 */
export function cantAttackReason(card: AttackBlockCard, ctx: AttackBlockContext): string | null {
  if (ctx.phase !== "main" || ctx.busy) return null;
  if (ctx.intents.some((i) => i.type === "declare_attack" && i.attackerId === card.id)) return null;
  if (ctx.turnsStarted != null && ctx.turnsStarted < 2) return "Can't attack on your first turn";
  if (card.rested) return "Rested: can't attack until your next Refresh";
  if (card.summoningSick || card.statusLabels?.includes("Summoning sick")) {
    return "Summoning sick: can't attack this turn";
  }
  if (card.statusLabels?.some((l) => /^(cannot|can't) attack$/i.test(l))) {
    return "An effect stops it from attacking";
  }
  return "Can't attack right now";
}

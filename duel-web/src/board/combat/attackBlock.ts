import type { Intent } from "../../net/protocol";

export type AttackBlockCard = {
  id: string;
  rested?: boolean;
  summoningSick?: boolean;
  statusLabels?: string[];
};

export type AttackBlockContext = {
  phase: string;
  busy: boolean;
  // The first turn can't attack.
  turnsStarted?: number;
  intents: readonly Intent[];
};

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

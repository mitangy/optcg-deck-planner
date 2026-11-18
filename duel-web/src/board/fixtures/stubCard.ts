import type { BattleState } from "@optcg/rules";
import type { CardView, Intent } from "../../net/protocol";

export type StubCard = Pick<CardView, "id" | "defId"> & Partial<CardView>;

export function stubCard(card: StubCard): CardView {
  return card as CardView;
}

export function stubBattle(battle: { attackerSeat: BattleState["attackerSeat"] } & Partial<BattleState>): BattleState {
  return battle as BattleState;
}

export function stubIntent(intent: { type: string } & Record<string, unknown>): Intent {
  return intent as unknown as Intent;
}

export function stubOf<T>(partial: object): T {
  return partial as T;
}

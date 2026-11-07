import type { BattleState } from "@optcg/rules";
import type { CardView, Intent } from "../../net/protocol";

/**
 * A card with only the fields a fixture or placeholder board cares about. The engine's `CardView` carries every
 * stat; the demo boards and the waiting board leave most out and the UI treats an absent stat as "unknown", so
 * the gap is bridged here once instead of inventing zeroes that would show on screen.
 */
export type StubCard = Pick<CardView, "id" | "defId"> & Partial<CardView>;

export function stubCard(card: StubCard): CardView {
  return card as CardView;
}

/** A battle with only the fields a test cares about (the attacker's seat is always known). */
export function stubBattle(battle: { attackerSeat: BattleState["attackerSeat"] } & Partial<BattleState>): BattleState {
  return battle as BattleState;
}

/**
 * An intent as older servers or hand-written fixtures spell it (`activate_leader`, `resolve_trigger`, a partial
 * field set). The engine's `Intent` union only has the current shapes.
 */
export function stubIntent(intent: { type: string } & Record<string, unknown>): Intent {
  return intent as unknown as Intent;
}

/** Fixture data that is deliberately partial (a view or a board side with only the fields under test), typed as `T`. */
export function stubOf<T>(partial: object): T {
  return partial as T;
}

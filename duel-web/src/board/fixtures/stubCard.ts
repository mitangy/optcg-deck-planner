import type { CardView } from "../../net/protocol";

/**
 * A card with only the fields a fixture or placeholder board cares about. The engine's `CardView` carries every
 * stat; the demo boards and the waiting board leave most out and the UI treats an absent stat as "unknown", so
 * the gap is bridged here once instead of inventing zeroes that would show on screen.
 */
export type StubCard = Pick<CardView, "id" | "defId"> & Partial<CardView>;

export function stubCard(card: StubCard): CardView {
  return card as CardView;
}

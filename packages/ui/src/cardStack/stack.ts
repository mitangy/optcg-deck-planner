/** Most cards a stack is drawn as; a badge or label still shows the exact count. */
export const MAX_STACK_CARDS = 4;

/** Copy layers drawn behind the front card: one per extra copy, up to the cap. */
export function stackLayerCount(count: number): number {
  return Math.max(0, Math.min(count, MAX_STACK_CARDS) - 1);
}

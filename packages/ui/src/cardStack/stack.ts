export const MAX_STACK_CARDS = 4;

export function stackLayerCount(count: number): number {
  return Math.max(0, Math.min(count, MAX_STACK_CARDS) - 1);
}

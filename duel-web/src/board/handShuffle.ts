/**
 * Motion for rearranging your own hand (a card dropped on a new spot, Sort
 * switched on or off). Cards keep their DOM nodes when the order changes, so
 * each one is drawn back from where it was to where it now sits (FLIP).
 *
 * - Drop: the dropped card lands from the pointer with a little settle, and
 *   the cards it pushed aside slide over, nearest first, like a ripple.
 * - Sort: every card that moves hops along an arc to its new spot, one after
 *   another in the new order, tilting the way it travels, like a riffle.
 */

export type Pt = { x: number; y: number };

export type ShuffleKind = "drop" | "sort";

export type ShuffleStep = {
  id: string;
  /** Offset from the new spot back to where the card was drawn (px). */
  dx: number;
  dy: number;
  /** Start delay before the scale is applied (ms). */
  delay: number;
  /** Arc height at mid-flight (px, negative = up). */
  lift: number;
  /** Tilt at mid-flight (deg). */
  tilt: number;
  /** The card that was dropped: lands with a settle. */
  landing: boolean;
};

/** Ripple step per card away from the drop. */
export const DROP_RIPPLE_MS = 22;
/** Riffle step per card in the new order (shrinks for big hands). */
export const SORT_STAGGER_MS = 34;
/** The whole riffle's stagger stays under this. */
const SORT_STAGGER_CAP_MS = 260;
/** Arc height as a share of a card's height. */
const SORT_LIFT = 0.28;
const SORT_TILT_DEG = 7;
/** Moves smaller than this are not worth drawing. */
const STILL_PX = 1;

/**
 * Steps for the cards that moved. `before` / `after` are card centres before
 * and after the change, `order` the new display order. A dropped card
 * (`landedId`) starts from `before` too, which the caller sets to the drop
 * point so it comes down from under the pointer.
 */
export function handShuffleSteps(
  kind: ShuffleKind,
  before: ReadonlyMap<string, Pt>,
  after: ReadonlyMap<string, Pt>,
  order: readonly string[],
  opts: { cardHeight: number; landedId?: string | null },
): ShuffleStep[] {
  const landedAt = opts.landedId != null ? order.indexOf(opts.landedId) : -1;
  const sortStep = Math.min(SORT_STAGGER_MS, SORT_STAGGER_CAP_MS / Math.max(1, order.length - 1));
  const steps: ShuffleStep[] = [];
  order.forEach((id, i) => {
    const from = before.get(id);
    const to = after.get(id);
    if (!from || !to) return;
    const dx = from.x - to.x;
    const dy = from.y - to.y;
    const landing = kind === "drop" && id === opts.landedId;
    if (!landing && Math.abs(dx) < STILL_PX && Math.abs(dy) < STILL_PX) return;
    if (kind === "drop") {
      steps.push({
        id,
        dx,
        dy,
        delay: landing || landedAt < 0 ? 0 : (Math.abs(i - landedAt) - 1) * DROP_RIPPLE_MS,
        lift: 0,
        tilt: 0,
        landing,
      });
      return;
    }
    steps.push({
      id,
      dx,
      dy,
      delay: Math.round(i * sortStep),
      lift: -opts.cardHeight * SORT_LIFT,
      // Lean into the travel: dx > 0 means it came from the right, so it is heading left.
      tilt: dx > 0 ? -SORT_TILT_DEG : SORT_TILT_DEG,
      landing: false,
    });
  });
  return steps;
}

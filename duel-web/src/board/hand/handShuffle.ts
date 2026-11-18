export type Pt = { x: number; y: number };

export type ShuffleKind = "drop" | "sort";

export type ShuffleStep = {
  id: string;
  dx: number;
  dy: number;
  delay: number;
  lift: number;
  tilt: number;
  landing: boolean;
};

export const DROP_RIPPLE_MS = 22;
export const SORT_STAGGER_MS = 34;
const SORT_STAGGER_CAP_MS = 260;
const SORT_LIFT = 0.28;
const SORT_TILT_DEG = 7;
const STILL_PX = 1;

// A dropped card starts from `before` too, which the caller sets to the drop point so it comes down from under the pointer.
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
      tilt: dx > 0 ? -SORT_TILT_DEG : SORT_TILT_DEG,
      landing: false,
    });
  });
  return steps;
}

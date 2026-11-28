/**
 * Pure ordering and timing rules for lists that hold still while you edit a row (#1498).
 *
 * A planner list recomputes its filter and sort on every Owned change, so a card you just covered
 * vanishes, or a count-sorted row jumps away, and the next click lands on a different card. The rows
 * you edited are "held": they keep the place they had and stay visible, then everything settles
 * into the live order once you are done with them.
 */

/**
 * The order to show right now.
 * - Pinned rows (held, or still fading out) keep the index they had in `prev`, even when they no longer
 *   pass the filter.
 * - Every other row follows `target`, so rows nobody is touching still sort and filter live.
 * - A pinned row that was not shown before flows in at its target place; one that is gone from `live` is dropped.
 */
export function computeDisplayedOrder({
  prev,
  target,
  pinned,
  live,
}: {
  prev: readonly string[];
  target: readonly string[];
  pinned: ReadonlySet<string>;
  live: ReadonlySet<string>;
}): string[] {
  if (pinned.size === 0) return [...target];
  const prevIndex = new Map(prev.map((id, i) => [id, i]));
  const result = target.filter((id) => !pinned.has(id));
  const keep = [...pinned]
    .filter((id) => live.has(id))
    .map((id) => ({ id, at: prevIndex.get(id) ?? -1 }))
    .sort((a, b) => a.at - b.at);
  for (const { id, at } of keep) {
    if (at >= 0) {
      result.splice(Math.min(at, result.length), 0, id);
    } else {
      // Never shown before: it only stays if it passes the filter, at its target place.
      const targetAt = target.indexOf(id);
      if (targetAt >= 0) result.splice(Math.min(targetAt, result.length), 0, id);
    }
  }
  return result;
}

export const DESKTOP_LEAVE_MS = 600;
export const TOUCH_IDLE_MS = 2500;
export const BULK_SETTLE_MS = 1200;
export const BACKSTOP_MS = 8000;

export type HoldTiming = {
  /** Last time the user did something to this row (or it was marked in bulk). */
  lastInteraction: number;
  /** When the pointer and focus both left the row. */
  leftAt: number;
  pointerInside: boolean;
  focusInside: boolean;
  /** The Owned input has focus: never released. */
  inputFocused: boolean;
  touch: boolean;
  /** Bulk Mark bought or a scanner add: nobody is pointing at the row. */
  bulk: boolean;
};

/** When this row may let go (Infinity: not while it is engaged). */
export function releaseAt(h: HoldTiming): number {
  if (h.inputFocused) return Infinity;
  const backstop = h.lastInteraction + BACKSTOP_MS;
  if (h.bulk) return Math.min(h.lastInteraction + BULK_SETTLE_MS, backstop);
  if (h.touch) return Math.min(h.lastInteraction + TOUCH_IDLE_MS, backstop);
  if (h.pointerInside || h.focusInside) return backstop;
  return Math.min(h.leftAt + DESKTOP_LEAVE_MS, backstop);
}

/** All held rows settle together: when the last one lets go. Infinity while any is engaged, null with none held. */
export function settleAt(holds: readonly HoldTiming[]): number | null {
  if (holds.length === 0) return null;
  return Math.max(...holds.map(releaseAt));
}

/** What a settle changed, for the screen reader line. */
export function settleSummary(before: readonly string[], after: readonly string[]): { removed: number; moved: number } {
  const afterSet = new Set(after);
  const kept = before.filter((id) => afterSet.has(id));
  const removed = before.length - kept.length;
  // Fewest rows that had to jump: everything outside the longest run that kept its relative order.
  const afterIndex = new Map(after.map((id, i) => [id, i]));
  const seq = kept.map((id) => afterIndex.get(id) as number);
  const tails: number[] = [];
  for (const v of seq) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = v;
  }
  const moved = kept.length - tails.length;
  return { removed, moved };
}

export function settleAnnouncement({ removed, moved }: { removed: number; moved: number }): string {
  const parts: string[] = [];
  if (removed > 0) parts.push(`${removed} removed`);
  if (moved > 0) parts.push(`${moved} moved`);
  return parts.length ? `List updated: ${parts.join(", ")}.` : "";
}

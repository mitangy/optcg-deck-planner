/**
 * Tab focus for the board. Tab / Shift+Tab step through the board cards
 * (field, then hand) as one stop in the page's Tab order: after the last card
 * Tab leaves to the next control (End turn, Concede, settings, grips…), and
 * Shift+Tab before the first card goes back to the control before it.
 */

/**
 * The element Tab should focus next, or null to leave it to the browser.
 * `tabbables` is every focusable element in document order (cards included),
 * `ring` the cards in board order, `active` the focused element.
 */
export function nextTabTarget<T>(tabbables: T[], ring: T[], active: T | null, backward: boolean): T | null {
  if (ring.length === 0) return null;
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  const at = active == null ? -1 : ring.indexOf(active);
  if (at >= 0) {
    const step = at + (backward ? -1 : 1);
    if (step >= 0 && step < ring.length) return ring[step]!;
  }
  // The cards count once, where the first one sits in the page.
  const inRing = new Set(ring);
  const stops = tabbables.filter((t) => t === first || !inRing.has(t));
  const from = at >= 0 ? stops.indexOf(first) : active == null ? -1 : stops.indexOf(active);
  // Nothing focused yet: go straight to the cards.
  if (from < 0) return backward ? last : first;
  const next = stops[(from + (backward ? -1 : 1) + stops.length) % stops.length]!;
  if (next === first) return backward ? last : first;
  return next;
}

export type TabKey = { key: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean };

export type TabContext = {
  /** Focus is in a text field (chat, inputs). */
  typing: boolean;
  /** A sheet, inspect view, prompt or other dialog owns the keyboard. */
  dialogOpen: boolean;
  /** Focus is inside the selected card's action popover. */
  inActions: boolean;
  over: boolean;
  /** Board cards that can take focus. */
  cardCount: number;
};

/** True when the board should take over this Tab press instead of the browser. */
export function takesTab(e: TabKey, ctx: TabContext): boolean {
  if (e.key !== "Tab" || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (ctx.typing || ctx.dialogOpen || ctx.inActions || ctx.over) return false;
  return ctx.cardCount > 0;
}

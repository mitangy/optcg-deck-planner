/**
 * Roving Tab focus for the board: Tab / Shift+Tab visit the board cards only
 * (not Undo, Concede, Leave, settings…), wrapping at both ends.
 */

/** Index to focus next among `count` board cards; `current` is -1 when focus is elsewhere. */
export function nextBoardFocusIndex(count: number, current: number, backward: boolean): number | null {
  if (count <= 0) return null;
  if (current < 0 || current >= count) return backward ? count - 1 : 0;
  return (current + (backward ? -1 : 1) + count) % count;
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

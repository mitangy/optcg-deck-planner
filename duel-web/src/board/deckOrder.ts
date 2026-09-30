/**
 * Arrangement for "put these cards back" prompts, read top → bottom like the
 * pile itself: `top` cards end up above the untouched rest of the deck (or
 * Life), `bottom` cards below it. Prompts with a single destination keep every
 * card in `top`; the prompt decides which side of the rest that list sits on.
 *
 * Matches the engine: tops are placed so the first is the very top, bottoms
 * in order so the last is the very bottom.
 */
export type Arrangement = { top: string[]; bottom: string[] };

/** Rows as drawn in a split (Top / Bottom) list; `null` is the "rest of deck" divider. */
export function arrangementRows(a: Arrangement): (string | null)[] {
  return [...a.top, null, ...a.bottom];
}

export function initialArrangement(ids: string[]): Arrangement {
  return { top: [...ids], bottom: [] };
}

/**
 * Moves `id` to `index` among the rows without it. Landing above the divider
 * places the card on top, below it on the bottom.
 */
export function moveToRow(a: Arrangement, id: string, index: number): Arrangement {
  const rows = arrangementRows(a).filter((r) => r !== id);
  rows.splice(Math.max(0, Math.min(index, rows.length)), 0, id);
  const divider = rows.indexOf(null);
  return { top: rows.slice(0, divider) as string[], bottom: rows.slice(divider + 1) as string[] };
}

/** One step up (-1) or down (+1); stepping over the divider switches Top/Bottom. */
export function nudge(a: Arrangement, id: string, delta: -1 | 1): Arrangement {
  const index = arrangementRows(a).indexOf(id);
  if (index < 0) return a;
  return moveToRow(a, id, index + delta);
}

/** Sends a card to one side, next to the rest of the deck (one step across the divider). */
export function setSide(a: Arrangement, id: string, side: "top" | "bottom"): Arrangement {
  if ((side === "top") === a.top.includes(id)) return a;
  const top = a.top.filter((x) => x !== id);
  const bottom = a.bottom.filter((x) => x !== id);
  return side === "top" ? { top: [...top, id], bottom } : { top, bottom: [id, ...bottom] };
}

export function withoutIds(a: Arrangement, ids: readonly string[]): Arrangement {
  if (!ids.length) return a;
  return { top: a.top.filter((x) => !ids.includes(x)), bottom: a.bottom.filter((x) => !ids.includes(x)) };
}

/**
 * Applies an edit made on the visible cards (`withoutIds(full, hidden)`) back
 * to the full arrangement; hidden cards keep their side, after the visible ones.
 */
export function mergeArrangement(full: Arrangement, visible: Arrangement, hidden: readonly string[]): Arrangement {
  return {
    top: [...visible.top, ...full.top.filter((x) => hidden.includes(x))],
    bottom: [...visible.bottom, ...full.bottom.filter((x) => hidden.includes(x))],
  };
}

/** `orderedOptionIds` / `topOptionIds` for `resolve_pending_choice`. */
export function arrangementAnswer(a: Arrangement): { orderedOptionIds: string[]; topOptionIds: string[] } {
  return { orderedOptionIds: [...a.top, ...a.bottom], topOptionIds: [...a.top] };
}

/**
 * Answer for "place the rest at the top or bottom": the cards move together,
 * so every card is on top or none is.
 */
export function groupAnswer(ids: string[], side: "top" | "bottom"): { orderedOptionIds: string[]; topOptionIds: string[] } {
  return { orderedOptionIds: [...ids], topOptionIds: side === "top" ? [...ids] : [] };
}

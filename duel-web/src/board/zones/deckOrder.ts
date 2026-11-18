// Matches the engine: tops are placed so the first is the very top, bottoms in order so the last is the very bottom.
export type Arrangement = { top: string[]; bottom: string[] };

export function arrangementRows(a: Arrangement): (string | null)[] {
  return [...a.top, null, ...a.bottom];
}

export function initialArrangement(ids: string[]): Arrangement {
  return { top: [...ids], bottom: [] };
}

export function moveToRow(a: Arrangement, id: string, index: number): Arrangement {
  const rows = arrangementRows(a).filter((r) => r !== id);
  rows.splice(Math.max(0, Math.min(index, rows.length)), 0, id);
  const divider = rows.indexOf(null);
  return { top: rows.slice(0, divider) as string[], bottom: rows.slice(divider + 1) as string[] };
}

export function nudge(a: Arrangement, id: string, delta: -1 | 1): Arrangement {
  const index = arrangementRows(a).indexOf(id);
  if (index < 0) return a;
  return moveToRow(a, id, index + delta);
}

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

// Hidden cards keep their side, after the visible ones.
export function mergeArrangement(full: Arrangement, visible: Arrangement, hidden: readonly string[]): Arrangement {
  return {
    top: [...visible.top, ...full.top.filter((x) => hidden.includes(x))],
    bottom: [...visible.bottom, ...full.bottom.filter((x) => hidden.includes(x))],
  };
}

export function arrangementAnswer(a: Arrangement): { orderedOptionIds: string[]; topOptionIds: string[] } {
  return { orderedOptionIds: [...a.top, ...a.bottom], topOptionIds: [...a.top] };
}

export function groupAnswer(ids: string[], side: "top" | "bottom"): { orderedOptionIds: string[]; topOptionIds: string[] } {
  return { orderedOptionIds: [...ids], topOptionIds: side === "top" ? [...ids] : [] };
}

export function nextTabTarget<T>(tabbables: T[], ring: T[], active: T | null, backward: boolean): T | null {
  if (ring.length === 0) return null;
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  const at = active == null ? -1 : ring.indexOf(active);
  if (at >= 0) {
    const step = at + (backward ? -1 : 1);
    if (step >= 0 && step < ring.length) return ring[step]!;
  }
  const inRing = new Set(ring);
  const stops = tabbables.filter((t) => t === first || !inRing.has(t));
  const from = at >= 0 ? stops.indexOf(first) : active == null ? -1 : stops.indexOf(active);
  if (from < 0) return backward ? last : first;
  const next = stops[(from + (backward ? -1 : 1) + stops.length) % stops.length]!;
  if (next === first) return backward ? last : first;
  return next;
}

export type TabKey = { key: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean };

export type TabContext = {
  typing: boolean;
  dialogOpen: boolean;
  inActions: boolean;
  over: boolean;
  cardCount: number;
};

export function takesTab(e: TabKey, ctx: TabContext): boolean {
  if (e.key !== "Tab" || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (ctx.typing || ctx.dialogOpen || ctx.inActions || ctx.over) return false;
  return ctx.cardCount > 0;
}

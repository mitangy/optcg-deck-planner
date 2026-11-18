/** Where a card page was opened from, carried in router state so its heading can link back there. */
export type CardBack = { to: string; label: string };

const LABELS: [RegExp, string][] = [
  [/^\/$/, "Shopping"],
  [/^\/decks$/, "Decks"],
  [/^\/collection$/, "Collection"],
  [/^\/meta$/, "Meta decks"],
  [/^\/alerts$/, "Alerts"],
  [/^\/friends(\/|$)/, "Friends"],
  [/^\/group-buys$/, "Group buys"],
  [/^\/group-buys\/\d+$/, "Group buy"],
  [/^\/share\//, "Shared list"],
];

/** The state to pass to a link to a card page from `from`, or undefined when the page is not worth a way back. */
export function cardBackState(from: { pathname: string; search?: string }, deckName?: string | null): { from: CardBack } | undefined {
  const to = `${from.pathname}${from.search ?? ""}`;
  if (/^\/decks\/\d+$/.test(from.pathname)) return { from: { to, label: deckName?.trim() || "Deck" } };
  if (/^\/cards\//.test(from.pathname)) return undefined;
  const hit = LABELS.find(([re]) => re.test(from.pathname));
  return hit ? { from: { to, label: hit[1] } } : undefined;
}

/** Reads the back link from router state; anything that is not an in-app path is ignored. */
export function readCardBack(state: unknown): CardBack | null {
  const from = (state as { from?: Partial<CardBack> } | null)?.from;
  if (!from || typeof from.to !== "string" || typeof from.label !== "string") return null;
  if (!from.to.startsWith("/") || from.to.startsWith("//") || !from.label) return null;
  return { to: from.to, label: from.label };
}

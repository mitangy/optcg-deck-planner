/**
 * Decks for the nightly bot self-play (#635): the current meta, from the backend's public /meta endpoints
 * (the same Limitless top finishes the duel app's meta deck browser shows).
 */
export type SelfPlayDeck = { name: string; leaderId: string; deck: string[] };

type MetaLeaderRow = { leader_id: string; name?: string; decks: number };
type MetaDeckRow = { placing: number | null; event?: string; date?: string; cards: { card_id: string; count: number }[] };

export const DECK_SIZE = 50;

/** The 50 card ids of a meta deck, copies repeated; null when the list is not exactly 50 cards. */
export function expandDeck(cards: { card_id: string; count: number }[]): string[] | null {
  const ids = cards.flatMap((c) => Array.from({ length: Math.max(0, Math.trunc(c.count)) }, () => c.card_id));
  return ids.length === DECK_SIZE ? ids : null;
}

/** The best-placed complete deck (placed decks first, then newest), or null when none is a full 50-card list. */
export function bestDeck(decks: MetaDeckRow[]): { ids: string[]; deck: MetaDeckRow } | null {
  const ordered = [...decks].sort((a, b) => (a.placing ?? Infinity) - (b.placing ?? Infinity) || String(b.date ?? "").localeCompare(String(a.date ?? "")));
  for (const deck of ordered) {
    const ids = expandDeck(deck.cards);
    if (ids) return { ids, deck };
  }
  return null;
}

async function getJson<T>(fetchImpl: typeof fetch, url: string): Promise<T> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** One deck for each of the most-played leaders in the last `days` days, ordered by how many decks the leader had. */
export async function fetchSelfPlayDecks(baseUrl: string, opts: { days?: number; leaders?: number; fetchImpl?: typeof fetch } = {}): Promise<SelfPlayDeck[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const days = opts.days ?? 30;
  const base = baseUrl.replace(/\/$/, "");
  const overview = await getJson<{ leaders: MetaLeaderRow[] }>(fetchImpl, `${base}/meta/leaders?days=${days}`);
  const out: SelfPlayDeck[] = [];
  for (const l of [...overview.leaders].sort((a, b) => b.decks - a.decks)) {
    if (out.length >= (opts.leaders ?? 16)) break;
    const q = new URLSearchParams({ leader: l.leader_id, days: String(days), top: "0" });
    const found = bestDeck((await getJson<{ decks: MetaDeckRow[] }>(fetchImpl, `${base}/meta/decks?${q}`)).decks);
    if (!found) continue;
    out.push({ name: `${l.name || l.leader_id} (${l.leader_id}) ${found.deck.event ?? "tournament"} ${found.deck.placing ? `#${found.deck.placing}` : ""}`.trim(), leaderId: l.leader_id, deck: found.ids });
  }
  return out;
}

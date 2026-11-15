import type { DeckSummary } from "../../api";

export type DeckCardMatch = { card_id: string; name: string; qty: number };

export type DeckCardSearchHit = {
  deck: DeckSummary;
  /** Cards in the deck matching the query, each with this deck's own copy count. */
  cards: DeckCardMatch[];
  leaderMatches: boolean;
};

/** Card ids compare without dashes or spaces, so "op01016" finds OP01-016. */
function squash(s: string): string {
  return s.toLowerCase().replace(/[-\s]/g, "");
}

function makeMatcher(query: string): ((name: string, id: string | null | undefined) => boolean) | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const qId = squash(q);
  return (name, id) =>
    name.toLowerCase().includes(q) || (qId !== "" && squash(id ?? "").includes(qId));
}

/**
 * The decks that run a card matching `query` (card name or id), with the matching cards of each.
 * Returns null for an empty query: no filtering (#1315).
 */
export function findDecksWithCard(decks: DeckSummary[], query: string): DeckCardSearchHit[] | null {
  const matches = makeMatcher(query);
  if (!matches) return null;
  const hits: DeckCardSearchHit[] = [];
  for (const deck of decks) {
    const cards = (deck.cards ?? []).filter((c) => matches(c.name, c.card_id));
    const leaderMatches = matches(deck.leader_name ?? "", deck.leader_card_id);
    if (cards.length > 0 || leaderMatches) hits.push({ deck, cards, leaderMatches });
  }
  return hits;
}

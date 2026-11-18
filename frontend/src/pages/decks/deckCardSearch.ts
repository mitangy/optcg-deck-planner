import type { DeckSummary } from "../../api";

export type DeckCardMatch = { card_id: string; name: string; qty: number };

export type DeckCardSearchHit = {
  deck: DeckSummary;
  cards: DeckCardMatch[];
  leaderMatches: boolean;
};

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

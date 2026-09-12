import { lookupCard } from "../cards/atlas";
import { getSavedDeck, saveDeck, type SavedDeck } from "./storage";

export const MAX_COPIES_PER_CARD = 4;
export const MAX_MAIN_DECK_SIZE = 50;

export type DeckEditResult =
  | { ok: true; deck: SavedDeck }
  | { ok: false; error: string };

function countInDeck(cards: string[], defId: string): number {
  return cards.reduce((n, id) => (id === defId ? n + 1 : n), 0);
}

function persist(deck: SavedDeck, cards: string[]): SavedDeck {
  return saveDeck({
    id: deck.id,
    name: deck.name,
    leaderId: deck.leaderId,
    cards,
  });
}

/** Add one copy of `defId` to the main deck (not the leader slot). */
export function addCardToDeck(deckId: string, defId: string): DeckEditResult {
  const deck = getSavedDeck(deckId);
  if (!deck) return { ok: false, error: "Deck not found" };

  const entry = lookupCard(defId);
  if (entry.type === "leader") {
    return { ok: false, error: "Leaders cannot be added to the main deck" };
  }
  if (deck.cards.length >= MAX_MAIN_DECK_SIZE) {
    return { ok: false, error: `Main deck is full (${MAX_MAIN_DECK_SIZE})` };
  }
  const copies = countInDeck(deck.cards, defId);
  if (copies >= MAX_COPIES_PER_CARD) {
    return {
      ok: false,
      error: `${defId} already has ${MAX_COPIES_PER_CARD} copies`,
    };
  }

  return { ok: true, deck: persist(deck, [...deck.cards, defId]) };
}

/** Remove one copy of `defId` from the main deck. */
export function removeCardFromDeck(
  deckId: string,
  defId: string,
): DeckEditResult {
  const deck = getSavedDeck(deckId);
  if (!deck) return { ok: false, error: "Deck not found" };

  const idx = deck.cards.lastIndexOf(defId);
  if (idx < 0) return { ok: false, error: `${defId} is not in this deck` };

  const next = [...deck.cards];
  next.splice(idx, 1);
  return { ok: true, deck: persist(deck, next) };
}

/** Remove every copy of `defId` from the main deck. */
export function removeAllCopiesFromDeck(
  deckId: string,
  defId: string,
): DeckEditResult {
  const deck = getSavedDeck(deckId);
  if (!deck) return { ok: false, error: "Deck not found" };
  if (!deck.cards.includes(defId)) {
    return { ok: false, error: `${defId} is not in this deck` };
  }
  return {
    ok: true,
    deck: persist(
      deck,
      deck.cards.filter((id) => id !== defId),
    ),
  };
}

export function countCardInDeck(deck: SavedDeck, defId: string): number {
  return countInDeck(deck.cards, defId);
}

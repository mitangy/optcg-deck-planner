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

/** One card's change from Log Pose's Apply card: `before` copies now, `after` copies wanted. */
export type DeckOp = { id: string; before: number; after: number };

/**
 * Apply Log Pose's suggested changes as one save (#400). Refuses, and changes nothing, when a card is not at the
 * count the suggestion was made for (the deck moved since) or when it names a leader.
 */
export function applyDeckOps(deckId: string, ops: DeckOp[]): DeckEditResult {
  const deck = getSavedDeck(deckId);
  if (!deck) return { ok: false, error: "Deck not found" };
  for (const op of ops) {
    if (lookupCard(op.id).type === "leader") return { ok: false, error: "Leaders cannot be added to the main deck" };
    const now = countInDeck(deck.cards, op.id);
    if (now !== op.before) {
      return { ok: false, error: `${op.id} has ${now} ${now === 1 ? "copy" : "copies"} now, not ${op.before}. Nothing was changed.` };
    }
  }
  const next = [...deck.cards];
  for (const op of ops) {
    for (let n = op.after - op.before; n > 0; n--) next.push(op.id);
    for (let n = op.before - op.after; n > 0; n--) next.splice(next.lastIndexOf(op.id), 1);
  }
  return { ok: true, deck: persist(deck, next) };
}

export function countCardInDeck(deck: SavedDeck, defId: string): number {
  return countInDeck(deck.cards, defId);
}

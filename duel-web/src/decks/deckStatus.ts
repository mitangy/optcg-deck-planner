import { MAX_MAIN_DECK_SIZE } from "./editDeck";

/** A constructed deck has a full 50-card main deck; fewer is flagged "Incomplete" in the lists. */
export function isIncompleteDeck(deck: { cards: readonly unknown[] }): boolean {
  return deck.cards.length < MAX_MAIN_DECK_SIZE;
}

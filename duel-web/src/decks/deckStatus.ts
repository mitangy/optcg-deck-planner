import { MAX_MAIN_DECK_SIZE } from "./editDeck";

export function isIncompleteDeck(deck: { cards: readonly unknown[] }): boolean {
  return deck.cards.length < MAX_MAIN_DECK_SIZE;
}

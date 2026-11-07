import { api, DeckDetail } from "../../api";

export const MAIN_DECK_LIMIT = 51;

export const DON_DECK_LIMIT = 10;

/** Past-50 decks are allowed; the hints tray flags them as a soft warning instead of a confirm. */
export async function setDeckCardNeeded(
  deckId: number,
  cardId: string,
  needed: number,
): Promise<DeckDetail | null> {
  return api.upsertDeckCard(deckId, cardId, needed, true);
}

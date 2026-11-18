import { api, DeckDetail } from "../../api";

export const MAIN_DECK_LIMIT = 51;

export const DON_DECK_LIMIT = 10;

export async function setDeckCardNeeded(
  deckId: number,
  cardId: string,
  needed: number,
): Promise<DeckDetail | null> {
  return api.upsertDeckCard(deckId, cardId, needed, true);
}

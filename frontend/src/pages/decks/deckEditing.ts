import { api, DeckDetail } from "../../api";

export const MAIN_DECK_LIMIT = 51;

export const DON_DECK_LIMIT = 10;

/** Most DON!! copies one Add click can put in a deck. */
export const DON_ADD_MAX = 99;

/**
 * A deck plays DON_DECK_LIMIT DON!!, but players may keep extras (#1317), so the count
 * is shown as "12/10 (+2 extra)". `inDeck` gives the drawer wording "12/10 in deck · 2 extra".
 */
export function formatDonCount(count: number, opts: { inDeck?: boolean } = {}): string {
  const extra = Math.max(0, count - DON_DECK_LIMIT);
  const base = `${count}/${DON_DECK_LIMIT}`;
  if (opts.inDeck) return extra > 0 ? `${base} in deck · ${extra} extra` : `${base} in deck`;
  return extra > 0 ? `${base} (+${extra} extra)` : base;
}

/** Past-50 decks are allowed; the hints tray flags them as a soft warning instead of a confirm. */
export async function setDeckCardNeeded(
  deckId: number,
  cardId: string,
  needed: number,
): Promise<DeckDetail | null> {
  return api.upsertDeckCard(deckId, cardId, needed, true);
}

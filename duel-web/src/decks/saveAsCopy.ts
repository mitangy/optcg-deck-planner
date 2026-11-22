import { saveDeckResult, type SavedDeck } from "./storage";
import type { DeckDraft } from "./editDeck";

/** Built-in starter decks have ids that start with "test-"; they are edited in place unless copied. */
export function isStarterDeck(deck: Pick<SavedDeck, "id">): boolean {
  return deck.id.startsWith("test-");
}

/** Saves the draft (unsaved edits included) as a new deck of the player's own, leaving the source untouched. */
export function saveDeckAsCopy(source: SavedDeck, draft: DeckDraft): { deck: SavedDeck; persisted: boolean } {
  const inDeck = new Set([draft.leaderId, ...draft.cards]);
  const artPrefs = Object.fromEntries(Object.entries(source.artPrefs ?? {}).filter(([defId]) => inDeck.has(defId)));
  return saveDeckResult({
    name: `${draft.name.trim() || source.name} (copy)`,
    leaderId: draft.leaderId,
    cards: draft.cards,
    artPrefs,
    noMerge: true,
  });
}

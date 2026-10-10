import { lookupCard } from "../cards/atlas";
import { getSavedDeck, saveDeck, type SavedDeck } from "./storage";

export const MAX_COPIES_PER_CARD = 4;
export const MAX_MAIN_DECK_SIZE = 50;

export type DeckEditResult =
  | { ok: true; deck: SavedDeck }
  | { ok: false; error: string };

/** Result of an edit on a bare card list (the deck editor's unsaved draft). */
export type CardsEditResult = { ok: true; cards: string[] } | { ok: false; error: string };

/** The part of a deck the editor changes before Save. */
export type DeckDraft = { leaderId: string; cards: string[] };

function countInDeck(cards: readonly string[], defId: string): number {
  return cards.reduce((n, id) => (id === defId ? n + 1 : n), 0);
}

/** Add one copy of `defId` to a main-deck list (not the leader slot). */
export function addCard(cards: readonly string[], defId: string): CardsEditResult {
  const entry = lookupCard(defId);
  if (entry.type === "leader") {
    return { ok: false, error: "Leaders cannot be added to the main deck" };
  }
  if (cards.length >= MAX_MAIN_DECK_SIZE) {
    return { ok: false, error: `Main deck is full (${MAX_MAIN_DECK_SIZE})` };
  }
  const copies = countInDeck(cards, defId);
  if (copies >= MAX_COPIES_PER_CARD) {
    return {
      ok: false,
      error: `${defId} already has ${MAX_COPIES_PER_CARD} copies`,
    };
  }
  return { ok: true, cards: [...cards, defId] };
}

/** Remove one copy of `defId` from a main-deck list. */
export function removeCard(cards: readonly string[], defId: string): CardsEditResult {
  const idx = cards.lastIndexOf(defId);
  if (idx < 0) return { ok: false, error: `${defId} is not in this deck` };

  const next = [...cards];
  next.splice(idx, 1);
  return { ok: true, cards: next };
}

/** Remove every copy of `defId` from a main-deck list. */
export function removeAllCopies(cards: readonly string[], defId: string): CardsEditResult {
  if (!cards.includes(defId)) {
    return { ok: false, error: `${defId} is not in this deck` };
  }
  return {
    ok: true,
    cards: cards.filter((id) => id !== defId),
  };
}

/** One card's change from Log Pose's Apply card: `before` copies now, `after` copies wanted. */
export type DeckOp = { id: string; before: number; after: number };

/**
 * Apply Log Pose's suggested changes to a card list (#400). Refuses, and changes nothing, when a card is not at the
 * count the suggestion was made for (the deck moved since) or when it names a leader.
 */
export function applyOps(cards: readonly string[], ops: DeckOp[]): CardsEditResult {
  for (const op of ops) {
    if (lookupCard(op.id).type === "leader") return { ok: false, error: "Leaders cannot be added to the main deck" };
    const now = countInDeck(cards, op.id);
    if (now !== op.before) {
      return { ok: false, error: `${op.id} has ${now} ${now === 1 ? "copy" : "copies"} now, not ${op.before}. Nothing was changed.` };
    }
  }
  const next = [...cards];
  for (const op of ops) {
    for (let n = op.after - op.before; n > 0; n--) next.push(op.id);
    for (let n = op.before - op.after; n > 0; n--) next.splice(next.lastIndexOf(op.id), 1);
  }
  return { ok: true, cards: next };
}

/** Whether the draft differs from the saved deck: another leader, or other cards (order does not matter) (#481). */
export function isDeckDirty(saved: DeckDraft, draft: DeckDraft): boolean {
  if (saved.leaderId !== draft.leaderId) return true;
  if (saved.cards.length !== draft.cards.length) return true;
  const a = [...saved.cards].sort();
  const b = [...draft.cards].sort();
  return a.some((id, i) => id !== b[i]);
}

function persist(deck: SavedDeck, cards: string[]): SavedDeck {
  return saveDeck({
    id: deck.id,
    name: deck.name,
    leaderId: deck.leaderId,
    cards,
  });
}

/** Run a card-list edit on a stored deck and save the result straight away. */
function editStored(deckId: string, edit: (cards: readonly string[]) => CardsEditResult): DeckEditResult {
  const deck = getSavedDeck(deckId);
  if (!deck) return { ok: false, error: "Deck not found" };
  const result = edit(deck.cards);
  if (!result.ok) return result;
  return { ok: true, deck: persist(deck, result.cards) };
}

/** Add one copy of `defId` to a stored deck's main deck and save. */
export function addCardToDeck(deckId: string, defId: string): DeckEditResult {
  return editStored(deckId, (cards) => addCard(cards, defId));
}

/** Remove one copy of `defId` from a stored deck and save. */
export function removeCardFromDeck(deckId: string, defId: string): DeckEditResult {
  return editStored(deckId, (cards) => removeCard(cards, defId));
}

/** Remove every copy of `defId` from a stored deck and save. */
export function removeAllCopiesFromDeck(deckId: string, defId: string): DeckEditResult {
  return editStored(deckId, (cards) => removeAllCopies(cards, defId));
}

/** Apply Log Pose's suggested changes to a stored deck as one save (#400). */
export function applyDeckOps(deckId: string, ops: DeckOp[]): DeckEditResult {
  return editStored(deckId, (cards) => applyOps(cards, ops));
}

export function countCardInDeck(deck: Pick<SavedDeck, "cards">, defId: string): number {
  return countInDeck(deck.cards, defId);
}

/**
 * Save the editor's draft as the deck (#481). Keeps art prefs only for cards still in the deck, and marks a
 * planner-linked deck `editedLocally` so games keep it instead of re-importing the planner's version.
 */
export function saveDeckDraft(deckId: string, draft: DeckDraft): DeckEditResult {
  const deck = getSavedDeck(deckId);
  if (!deck) return { ok: false, error: "Deck not found" };
  const inDeck = new Set([draft.leaderId, ...draft.cards]);
  const artPrefs = Object.fromEntries(Object.entries(deck.artPrefs ?? {}).filter(([defId]) => inDeck.has(defId)));
  return {
    ok: true,
    deck: saveDeck({
      id: deck.id,
      name: deck.name,
      leaderId: draft.leaderId,
      cards: draft.cards,
      artPrefs,
      editedLocally: deck.plannerDeckId ? true : undefined,
    }),
  };
}

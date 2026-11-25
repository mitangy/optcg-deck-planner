import { MAIN_DECK_SIZE } from "@optcg/card-core";
import { lookupCard, maxCopiesFor } from "../cards/atlas";
import { getSavedDeck, saveDeck, type SavedDeck } from "./storage";

export const MAX_MAIN_DECK_SIZE = MAIN_DECK_SIZE;

export type DeckEditResult =
  | { ok: true; deck: SavedDeck }
  | { ok: false; error: string };

export type CardsEditResult = { ok: true; cards: string[] } | { ok: false; error: string };

export type DeckDraft = { name: string; leaderId: string; cards: string[] };

export const BLANK_DECK_NAME_ERROR = "Enter a deck name.";
export const MAX_DECK_NAME_LENGTH = 80;

function countInDeck(cards: readonly string[], defId: string): number {
  return cards.reduce((n, id) => (id === defId ? n + 1 : n), 0);
}

export function addCard(cards: readonly string[], defId: string): CardsEditResult {
  const entry = lookupCard(defId);
  if (entry.type === "leader") {
    return { ok: false, error: "Leaders cannot be added to the main deck" };
  }
  if (cards.length >= MAX_MAIN_DECK_SIZE) {
    return { ok: false, error: `Main deck is full (${MAX_MAIN_DECK_SIZE})` };
  }
  const copies = countInDeck(cards, defId);
  const maxCopies = maxCopiesFor(defId);
  if (copies >= maxCopies) {
    return {
      ok: false,
      error: `${defId} already has ${maxCopies} copies`,
    };
  }
  return { ok: true, cards: [...cards, defId] };
}

export function removeCard(cards: readonly string[], defId: string): CardsEditResult {
  const idx = cards.lastIndexOf(defId);
  if (idx < 0) return { ok: false, error: `${defId} is not in this deck` };

  const next = [...cards];
  next.splice(idx, 1);
  return { ok: true, cards: next };
}

export function removeAllCopies(cards: readonly string[], defId: string): CardsEditResult {
  if (!cards.includes(defId)) {
    return { ok: false, error: `${defId} is not in this deck` };
  }
  return {
    ok: true,
    cards: cards.filter((id) => id !== defId),
  };
}

export type DeckOp = { id: string; before: number; after: number };

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
  if (next.length > cards.length && next.length > MAX_MAIN_DECK_SIZE) return { ok: false, error: `Main deck is full (${MAX_MAIN_DECK_SIZE})` };
  return { ok: true, cards: next };
}

export function isDeckDirty(saved: DeckDraft, draft: DeckDraft): boolean {
  if (saved.name.trim() !== draft.name.trim()) return true;
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

function editStored(deckId: string, edit: (cards: readonly string[]) => CardsEditResult): DeckEditResult {
  const deck = getSavedDeck(deckId);
  if (!deck) return { ok: false, error: "Deck not found" };
  const result = edit(deck.cards);
  if (!result.ok) return result;
  return { ok: true, deck: persist(deck, result.cards) };
}

export function addCardToDeck(deckId: string, defId: string): DeckEditResult {
  return editStored(deckId, (cards) => addCard(cards, defId));
}

export function removeCardFromDeck(deckId: string, defId: string): DeckEditResult {
  return editStored(deckId, (cards) => removeCard(cards, defId));
}

export function removeAllCopiesFromDeck(deckId: string, defId: string): DeckEditResult {
  return editStored(deckId, (cards) => removeAllCopies(cards, defId));
}

export function applyDeckOps(deckId: string, ops: DeckOp[]): DeckEditResult {
  return editStored(deckId, (cards) => applyOps(cards, ops));
}

export function countCardInDeck(deck: Pick<SavedDeck, "cards">, defId: string): number {
  return countInDeck(deck.cards, defId);
}

export function saveDeckDraft(deckId: string, draft: DeckDraft): DeckEditResult {
  const deck = getSavedDeck(deckId);
  if (!deck) return { ok: false, error: "Deck not found" };
  const name = draft.name.trim();
  if (!name) return { ok: false, error: BLANK_DECK_NAME_ERROR };
  const inDeck = new Set([draft.leaderId, ...draft.cards]);
  const artPrefs = Object.fromEntries(Object.entries(deck.artPrefs ?? {}).filter(([defId]) => inDeck.has(defId)));
  return {
    ok: true,
    deck: saveDeck({
      id: deck.id,
      name,
      leaderId: draft.leaderId,
      cards: draft.cards,
      artPrefs,
    }),
  };
}

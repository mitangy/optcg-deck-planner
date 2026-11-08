import { useEffect, useMemo, useState } from "react";
import { cardDataReady, useCardDataReady } from "../../cards/cardData";
import {
  ensureDefaultDeck,
  ensureTestDecks,
  getSelectedDeckId,
  listSavedDecks,
  setSelectedDeckId,
  type SavedDeck,
} from "../../decks/storage";
import { useSavedDecksVersion } from "../../decks/useSavedDecksVersion";
import { BOT_DECK_MIRROR, BOT_DECK_RANDOM } from "../../home/botGame";

/** The saved decks, the one chosen to sail with, and the opponent / bot deck choices that depend on them. */
export function useLobbyDecks() {
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [opponentDeckId, setOpponentDeckId] = useState("");
  /** Play vs Bot: which saved deck it plays ("" = a copy of yours). */
  const [botDeckId, setBotDeckId] = useState(BOT_DECK_MIRROR);

  function refreshDecks() {
    // Seeding the starter decks reads the card data, which is its own chunk. A returning player's decks are
    // already saved, so they show at once (the leader name fills in later); a first visit waits for the data.
    if (!cardDataReady() && listSavedDecks().length === 0) return;
    const seeded = cardDataReady() ? ensureDefaultDeck() : undefined;
    if (cardDataReady()) ensureTestDecks();
    const all = listSavedDecks();
    setDecks(all);
    // Prefer the persisted lobby choice — otherwise mount always falls back to ST01 Luffy.
    const prefer = selectedId || getSelectedDeckId() || undefined;
    const sel = (prefer && all.find((d) => d.id === prefer)) || seeded || all[0];
    setSelectedId(sel.id);
    if (seeded) setSelectedDeckId(sel.id);
    setBotDeckId((prev) => (prev !== BOT_DECK_MIRROR && prev !== BOT_DECK_RANDOM && !all.some((d) => d.id === prev) ? BOT_DECK_MIRROR : prev));
    setOpponentDeckId((prev) => {
      if (prev && all.some((d) => d.id === prev)) return prev;
      // Prefer a different constructed deck for the enemy when available.
      const other = all.find((d) => d.id !== sel.id) ?? sel;
      return other.id;
    });
  }

  const syncedDecks = useSavedDecksVersion();
  useEffect(() => {
    if (syncedDecks > 0) refreshDecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncedDecks]);

  // The card data lands after the first paint: seed the starters and pick the deck once it is in.
  const cardsReady = useCardDataReady();
  useEffect(() => {
    if (cardsReady) refreshDecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardsReady]);

  useEffect(() => {
    refreshDecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedDeck = useMemo(() => decks.find((d) => d.id === selectedId) ?? null, [decks, selectedId]);

  function chooseDeck(id: string) {
    setSelectedId(id);
    setSelectedDeckId(id);
  }

  return { decks, selectedId, selectedDeck, opponentDeckId, setOpponentDeckId, botDeckId, setBotDeckId, refreshDecks, chooseDeck };
}

export type LobbyDecks = ReturnType<typeof useLobbyDecks>;

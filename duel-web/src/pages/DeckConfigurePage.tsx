import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { DeckEditor } from "../board/DeckEditor";
import { MAX_MAIN_DECK_SIZE } from "../decks/editDeck";
import {
  ensureDefaultDeck,
  getSavedDeck,
  listSavedDecks,
  setSelectedDeckId,
} from "../decks/storage";

export function DeckConfigurePage() {
  const { deckId } = useParams<{ deckId: string }>();
  const [tick, setTick] = useState(0);

  const resolvedId = useMemo(() => {
    void tick;
    ensureDefaultDeck();
    if (deckId) {
      const hit = getSavedDeck(deckId);
      if (hit) return hit.id;
    }
    return listSavedDecks()[0]?.id ?? null;
  }, [deckId, tick]);

  const deck = resolvedId ? getSavedDeck(resolvedId) : undefined;

  useEffect(() => {
    if (deck) setSelectedDeckId(deck.id);
  }, [deck]);

  if (!resolvedId || !deck) {
    return <Navigate to="/decks" replace />;
  }

  if (deckId !== resolvedId) {
    return <Navigate to={`/decks/${resolvedId}/configure`} replace />;
  }

  return (
    <div className="app-shell">
      <div className="deck-config">
        <header className="deck-config-header">
          <Link to="/decks" className="btn btn-secondary deck-config-back">
            ← Decks
          </Link>
          <div className="deck-config-heading">
            <h1 className="deck-config-title">{deck.name}</h1>
            <p className="meta">
              Leader {deck.leaderId} · {deck.cards.length}/{MAX_MAIN_DECK_SIZE} main
            </p>
          </div>
        </header>

        <DeckEditor
          deckId={deck.id}
          refreshKey={tick}
          onDeckChanged={() => setTick((n) => n + 1)}
        />
      </div>
    </div>
  );
}

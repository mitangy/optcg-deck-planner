import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { DeckEditor } from "../board/DeckEditor";
import { DeckImportPanel } from "../board/DeckImportPanel";
import { MAX_MAIN_DECK_SIZE } from "../decks/editDeck";
import {
  getSavedDeck,
  importIntoSavedDeck,
  setSelectedDeckId,
} from "../decks/storage";

export function DeckConfigurePage() {
  const { deckId } = useParams<{ deckId: string }>();
  const [tick, setTick] = useState(0);
  const [importText, setImportText] = useState("");
  const [importErr, setImportErr] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const deck = useMemo(() => {
    void tick;
    return deckId ? getSavedDeck(deckId) : undefined;
  }, [deckId, tick]);

  useEffect(() => {
    if (deck) setSelectedDeckId(deck.id);
  }, [deck]);

  if (!deckId || !deck) {
    return <Navigate to="/decks" replace />;
  }

  function refresh() {
    setTick((n) => n + 1);
  }

  function onImportIntoDeck() {
    setImportErr(null);
    setImportMsg(null);
    setImportBusy(true);
    const result = importIntoSavedDeck(deckId!, importText);
    setImportBusy(false);
    if (!result.ok) {
      setImportErr(result.errors.join(" · ") || "Import failed");
      return;
    }
    setImportText("");
    refresh();
    setImportMsg(
      `Imported (${result.deck.cards.length} main)${
        result.warnings.length ? ` — ${result.warnings.join(" ")}` : ""
      }`,
    );
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

        <DeckImportPanel
          importText={importText}
          onImportTextChange={setImportText}
          onImport={onImportIntoDeck}
          busy={importBusy}
          error={importErr}
          message={importMsg}
        />

        <DeckEditor deckId={deck.id} refreshKey={tick} onDeckChanged={refresh} />
      </div>
    </div>
  );
}

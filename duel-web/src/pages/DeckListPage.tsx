import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { lookupCard } from "../cards/atlas";
import {
  deleteDeck,
  ensureDefaultDeck,
  ensureTestDecks,
  listSavedDecks,
  setSelectedDeckId,
  type SavedDeck,
} from "../decks/storage";

function DeckRow({
  deck,
  onOpen,
  onDelete,
}: {
  deck: SavedDeck;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const leader = lookupCard(deck.leaderId);
  const canDelete = !deck.id.startsWith("test-");

  return (
    <li className="deck-list-row">
      <button type="button" className="deck-list-open" onClick={onOpen}>
        <div className="deck-list-meta">
          <div className="deck-list-name">{deck.name}</div>
          <div className="deck-list-sub">
            {leader.name} ({deck.leaderId}) · {deck.cards.length} main
          </div>
        </div>
      </button>
      {canDelete ? (
        <button type="button" className="btn btn-danger deck-list-delete" onClick={onDelete}>
          Delete
        </button>
      ) : null}
    </li>
  );
}

export function DeckListPage() {
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);

  const decks = useMemo(() => {
    void tick;
    ensureDefaultDeck();
    ensureTestDecks();
    return listSavedDecks();
  }, [tick]);

  function refresh() {
    setTick((n) => n + 1);
  }

  return (
    <div className="app-shell">
      <div className="deck-config">
        <header className="deck-config-header">
          <Link to="/" className="btn btn-secondary deck-config-back">
            ← Lobby
          </Link>
          <div className="deck-config-heading">
            <h1 className="deck-config-title">Decks</h1>
            <p className="meta">Choose a deck to edit, or create a new one.</p>
          </div>
          <button
            type="button"
            className="btn btn-primary deck-list-new"
            onClick={() => navigate("/decks/new")}
          >
            New deck
          </button>
        </header>

        {decks.length === 0 ? (
          <p className="meta">
            No decks yet.{" "}
            <button type="button" className="linkish" onClick={() => navigate("/decks/new")}>
              Create a deck
            </button>
            .
          </p>
        ) : (
          <ul className="deck-list">
            {decks.map((deck) => (
              <DeckRow
                key={deck.id}
                deck={deck}
                onOpen={() => {
                  setSelectedDeckId(deck.id);
                  navigate(`/decks/${deck.id}/configure`);
                }}
                onDelete={() => {
                  if (
                    !window.confirm(
                      `Delete “${deck.name}”? This cannot be undone.`,
                    )
                  ) {
                    return;
                  }
                  deleteDeck(deck.id);
                  refresh();
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

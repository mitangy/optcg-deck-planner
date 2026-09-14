import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DeckEditor } from "../board/DeckEditor";
import { DeckImportPanel } from "../board/DeckImportPanel";
import { MAX_MAIN_DECK_SIZE } from "../decks/editDeck";
import {
  createDeckFromInput,
  getSavedDeck,
  importIntoSavedDeck,
  setSelectedDeckId,
} from "../decks/storage";

export function NewDeckPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [initialList, setInitialList] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [deckId, setDeckId] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [importErr, setImportErr] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  const deck = deckId ? getSavedDeck(deckId) : undefined;

  function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreateErr(null);
    if (!name.trim()) {
      setCreateErr("Enter a deck name.");
      return;
    }
    setCreating(true);
    const result = createDeckFromInput(name, initialList);
    setCreating(false);
    if (!result.ok) {
      setCreateErr(result.errors.join(" · ") || "Could not create deck");
      return;
    }
    setSelectedDeckId(result.deck.id);
    setDeckId(result.deck.id);
    setEditorKey((n) => n + 1);
    if (result.warnings.length) {
      setImportMsg(result.warnings.join(" "));
    }
  }

  function onImportIntoDeck() {
    if (!deckId) return;
    setImportErr(null);
    setImportMsg(null);
    setImportBusy(true);
    const result = importIntoSavedDeck(deckId, importText);
    setImportBusy(false);
    if (!result.ok) {
      setImportErr(result.errors.join(" · ") || "Import failed");
      return;
    }
    setImportText("");
    setEditorKey((n) => n + 1);
    setImportMsg(
      `Imported into “${result.deck.name}” (${result.deck.cards.length} main)${
        result.warnings.length ? ` — ${result.warnings.join(" ")}` : ""
      }`,
    );
  }

  if (deckId && deck) {
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
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate(`/decks/${deck.id}/configure`)}
            >
              Done
            </button>
          </header>

          <DeckImportPanel
            importText={importText}
            onImportTextChange={setImportText}
            onImport={onImportIntoDeck}
            busy={importBusy}
            error={importErr}
            message={importMsg}
          />

          <DeckEditor deckId={deck.id} refreshKey={editorKey} onDeckChanged={() => setEditorKey((n) => n + 1)} />
        </div>
      </div>
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
            <h1 className="deck-config-title">New deck</h1>
            <p className="meta">
              Name the deck and optionally paste a list. You can keep importing and add cards
              manually after creating.
            </p>
          </div>
        </header>

        <form className="deck-new-form" onSubmit={onCreate}>
          <label htmlFor="new-deck-name">Deck name</label>
          <input
            id="new-deck-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My red ST01"
            required
            autoFocus
          />

          <h2 className="lobby-section-title">Import deck list (optional)</h2>
          <p className="meta">
            Same format as OPTCGSim — leave empty to start blank and add cards manually.
          </p>
          <textarea
            className="lobby-textarea"
            rows={10}
            value={initialList}
            onChange={(e) => setInitialList(e.target.value)}
            placeholder={"1xST01-001\n4xST01-003\n4xST01-006\n4xST01-008\n4xST01-009\n4xST01-014"}
          />

          {createErr ? (
            <p className="deck-edit-error" role="alert">
              {createErr}
            </p>
          ) : null}

          <div className="deck-new-actions">
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating
                ? "Creating…"
                : initialList.trim()
                  ? "Create deck from list"
                  : "Create blank deck"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

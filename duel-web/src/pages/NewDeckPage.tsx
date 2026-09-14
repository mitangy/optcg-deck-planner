import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DeckImportPanel } from "../board/DeckImportPanel";
import { createDeckFromInput, setSelectedDeckId } from "../decks/storage";

export function NewDeckPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [initialList, setInitialList] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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
    navigate(`/decks/${result.deck.id}/configure`, { replace: true });
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
              Name the deck and optionally paste a list. You can import again and add cards
              manually on the next screen.
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

          <DeckImportPanel
            heading="Import deck list (optional)"
            hint="Same format as OPTCGSim — leave empty to start blank and add cards manually."
            importText={initialList}
            onImportTextChange={setInitialList}
            onImport={() => undefined}
            showImportButton={false}
            error={createErr}
          />

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

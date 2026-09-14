import { useState } from "react";

type Props = {
  importText: string;
  onImportTextChange: (text: string) => void;
  onImport: () => void;
  busy?: boolean;
  message?: string | null;
  error?: string | null;
  heading?: string;
  hint?: string;
  buttonLabel?: string;
  /** When false, only show paste UI (e.g. new-deck create form uses Submit). */
  showImportButton?: boolean;
};

export function DeckImportPanel({
  importText,
  onImportTextChange,
  onImport,
  busy = false,
  message,
  error,
  heading = "Import deck list",
  hint = "OPTCGSim / planner format — one card per line like 4xST01-003. Replaces leader and main deck.",
  buttonLabel = "Import into deck",
  showImportButton = true,
}: Props) {
  const [clipErr, setClipErr] = useState<string | null>(null);

  async function pasteFromClipboard() {
    setClipErr(null);
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setClipErr("Clipboard is empty.");
        return;
      }
      onImportTextChange(text.trim());
    } catch {
      setClipErr("Could not read clipboard — paste with Ctrl+V.");
    }
  }

  return (
    <section className="deck-import-panel" aria-label={heading}>
      <h2 className="lobby-section-title">{heading}</h2>
      <p className="meta">{hint}</p>
      <div className="deck-import-actions">
        <button type="button" className="btn btn-secondary" onClick={() => void pasteFromClipboard()}>
          Paste from clipboard
        </button>
      </div>
      <label htmlFor="deck-import-text">Decklist</label>
      <textarea
        id="deck-import-text"
        className="lobby-textarea"
        rows={8}
        value={importText}
        onChange={(e) => onImportTextChange(e.target.value)}
        placeholder={"1xST01-001\n4xST01-003\n4xST01-006\n4xST01-008\n4xST01-009\n4xST01-014"}
      />
      {clipErr ? <p className="deck-edit-error">{clipErr}</p> : null}
      {error ? (
        <p className="deck-edit-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="meta">{message}</p> : null}
      {showImportButton ? (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || !importText.trim()}
          onClick={onImport}
        >
          {busy ? "Importing…" : buttonLabel}
        </button>
      ) : null}
    </section>
  );
}

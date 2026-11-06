import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogTitle } from "@optcg/ui/popups";
import { api, type DeckDetail } from "./api";

/**
 * Overwrite a deck's leader and cards with a pasted OPTCGSim deck code (#1016).
 * The dialog is the confirmation step: nothing is sent until "Replace deck".
 */
export function ReplaceDeckListDialog({
  open,
  deckId,
  deckName,
  onClose,
  onReplaced,
}: {
  open: boolean;
  deckId: number;
  deckName: string;
  onClose: () => void;
  onReplaced: (detail: DeckDetail) => void;
}) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // A fresh box each time it opens.
  useEffect(() => {
    if (open) {
      setText("");
      setErr(null);
    }
  }, [open]);

  const replace = useMutation({
    mutationFn: () => api.replaceDeckList(deckId, text),
    onSuccess: (detail) => onReplaced(detail),
    onError: (e: Error) => setErr(e.message),
  });

  async function pasteFromClipboard() {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) {
        setErr("Clipboard is empty.");
        return;
      }
      setText(clip.trim());
      setErr(null);
    } catch {
      setErr("Could not read clipboard — paste into the box with Ctrl+V.");
    }
  }

  const empty = !text.trim();

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!replace.isPending) onClose();
      }}
      className="replace-deck-backdrop"
      panelClassName="import-form replace-deck-dialog"
    >
      <DialogTitle as="h2" className="replace-deck-title">
        Replace {deckName}?
      </DialogTitle>
      <p className="muted">
        Your pasted list replaces the leader and every card in this deck. The name, owned counts and
        shopping links stay.
      </p>
      <div className="paste-actions">
        <button type="button" className="btn secondary" onClick={() => void pasteFromClipboard()}>
          Paste from clipboard
        </button>
      </div>
      <label>
        Deck code
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={"1xOP15-002\n4xOP15-053\n4xOP15-052\n…"}
        />
      </label>
      <p className="error replace-deck-error" role="alert">
        {err}
      </p>
      <div className="replace-deck-actions">
        <button
          type="button"
          className="btn primary danger"
          disabled={empty || replace.isPending}
          onClick={() => {
            setErr(null);
            replace.mutate();
          }}
        >
          {replace.isPending ? "Replacing…" : "Replace deck"}
        </button>
        <button type="button" className="btn secondary" onClick={onClose} disabled={replace.isPending}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}

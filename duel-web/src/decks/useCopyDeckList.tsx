import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogTitle } from "@optcg/ui/popups";
import { deckListText } from "./deckListText";

/** A short status toast: `say` shows a message for a few seconds in the `role="status"` region `toast` renders. */
export function useToast() {
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const say = useCallback((message: string) => {
    setNotice(message);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice(null), 3500);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const toast = (
    <div className="deck-list-toast" role="status" aria-live="polite">
      {notice}
    </div>
  );
  return { say, toast };
}

function CopyListDialog({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} className="leave-dialog-backdrop" panelClassName="leave-dialog">
      <DialogTitle as="h2">Copy deck list</DialogTitle>
      <p className="meta">Your browser blocked copying. Select the list below and copy it by hand.</p>
      <textarea
        className="deck-copy-text"
        readOnly
        rows={10}
        value={text}
        aria-label="Deck list"
        data-autofocus
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="leave-dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </Dialog>
  );
}

/** Copies a deck's OPTCGSim code to the clipboard and says so; when the browser blocks it, `dialog` shows the text to copy by hand. */
export function useCopyDeckList(say: (message: string) => void) {
  const [fallback, setFallback] = useState<string | null>(null);
  async function copyList(deck: { name: string; leaderId: string; cards: string[] }) {
    const text = deckListText(deck);
    try {
      await navigator.clipboard.writeText(text);
      say(`Copied the deck list for “${deck.name}”.`);
    } catch {
      setFallback(text);
    }
  }
  const dialog = fallback !== null ? <CopyListDialog text={fallback} onClose={() => setFallback(null)} /> : null;
  return { copyList, dialog };
}

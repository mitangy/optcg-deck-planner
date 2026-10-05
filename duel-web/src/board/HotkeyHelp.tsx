import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const KEYS: { keys: string; text: string }[] = [
  { keys: "Space", text: "Main action (End turn, Pass, Keep hand). Press twice when End turn asks to confirm." },
  { keys: "H", text: "Show or tuck the hand drawer (when the hand is not in the side rail). With Keep hand open on, hide the hand completely or bring it back." },
  { keys: "S", text: "Sort the hand by cost." },
  { keys: "1–9", text: "Press the Nth action button shown for the selected card." },
  { keys: "A", text: "Attack with the selected card (first attack shown)." },
  { keys: "E", text: "Activate the selected card's ability." },
  { keys: "P", text: "Play the selected hand card." },
  { keys: "D", text: "Attach DON!! to the selected card (when offered)." },
  { keys: "← →", text: "Select the previous or next hand card." },
  { keys: "Esc", text: "Cancel a DON!! selection, then deselect the card; also closes a panel." },
  { keys: "Tab", text: "Move through the cards and buttons; Shift+Tab goes back. Enter selects the focused card." },
  { keys: "I", text: "Inspect the focused card (same as double-click, long-press or right-click)." },
  { keys: "Right-click", text: "Inspect a card with the mouse." },
  { keys: "?", text: "This list." },
];

/** Keyboard shortcut list; same sheet as Gameplay settings. */
export function HotkeyHelpSheet({ onClose }: { onClose: () => void }) {
  // Subscribed once: the board's own Esc handler re-renders mid-dispatch, and a
  // listener re-added by an `[onClose]` effect would miss the same keypress.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return createPortal(
    <div
      className="sheet-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div className="sheet-head">
          <span className="icon-btn-spacer" aria-hidden />
          <h2 className="sheet-title">Shortcuts</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <dl className="hotkey-list">
          {KEYS.map((k) => (
            <div className="hotkey-row" key={k.keys}>
              <dt>
                <kbd className="kbd">{k.keys}</kbd>
              </dt>
              <dd>{k.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>,
    document.body,
  );
}

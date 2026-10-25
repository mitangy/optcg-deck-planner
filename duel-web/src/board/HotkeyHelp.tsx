import { Dialog } from "@optcg/ui/popups";

const KEYS: { keys: string; text: string }[] = [
  { keys: "Space", text: "Main action (End turn, Pass, Keep hand). Press twice when End turn asks to confirm." },
  { keys: "Y / N", text: "Answer Yes or No on a Yes/No prompt (Y = Activate Trigger, N = Add to hand; a Life card with no Trigger has one answer, so Y, Space and N all add it to hand). Space also answers Yes, and Y or Space presses Confirm when picking cards." },
  { keys: "H", text: "Show or tuck the hand drawer (when the hand is not in the side rail). With Keep hand open on, hide the hand completely or bring it back." },
  { keys: "S", text: "Sort the hand by cost." },
  { keys: "F", text: "Full screen on or off (when your browser offers it)." },
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
  return (
    <Dialog open onClose={onClose} className="sheet-backdrop" panelClassName="sheet" label="Keyboard shortcuts">
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
    </Dialog>
  );
}

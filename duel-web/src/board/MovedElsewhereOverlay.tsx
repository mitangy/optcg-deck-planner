import { useState } from "react";

/**
 * Shown on the old device after the account took this match over elsewhere
 * (#451). Fixed over the frozen board, so nothing in the board moves.
 */
export function MovedElsewhereOverlay({
  onPlayHere,
  onLeave,
}: {
  /** Take the match back to this device. */
  onPlayHere: () => Promise<void> | void;
  onLeave: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="moved-overlay" role="alertdialog" aria-modal="true" aria-labelledby="moved-title">
      <div className="moved-card">
        <h2 id="moved-title">Continued on another device</h2>
        <p>Your match moved to another device. Moves made here won&apos;t count.</p>
        <div className="moved-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onPlayHere();
              } finally {
                setBusy(false);
              }
            }}
          >
            Play here instead
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onLeave}>
            Back to lobby
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Dialog, DialogTitle } from "@optcg/ui/popups";

const noop = () => {};

export function MovedElsewhereOverlay({
  onPlayHere,
  onLeave,
}: {
  onPlayHere: () => Promise<void> | void;
  onLeave: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onClose={noop} role="alertdialog" className="moved-overlay" panelClassName="moved-card">
      <DialogTitle as="h2">Continued on another device</DialogTitle>
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
    </Dialog>
  );
}

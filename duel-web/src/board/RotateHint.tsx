import { useEffect } from "react";
import { createPortal } from "react-dom";

const HIDE_AFTER_MS = 6000;

/**
 * One-time nudge on portrait phones: the board gets bigger cards in landscape.
 * A fixed toast above the hand, so it never shifts the board; it hides itself.
 */
export function RotateHint({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onClose, HIDE_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="rotate-hint" role="status">
      <span className="rotate-hint-icon" aria-hidden>
        ⟳
      </span>
      <span className="rotate-hint-text">Rotate for bigger cards</span>
      <button type="button" className="rotate-hint-close" aria-label="Dismiss" onClick={onClose}>
        ✕
      </button>
    </div>,
    document.body,
  );
}

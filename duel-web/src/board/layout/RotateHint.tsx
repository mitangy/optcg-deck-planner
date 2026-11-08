import { useEffect } from "react";

const HIDE_AFTER_MS = 6000;

/**
 * One-time nudge on portrait phones: the board gets bigger cards in landscape.
 * Sits in the idle midline strip between the mats, which is always reserved,
 * so it never shifts the board or covers either field; it hides itself.
 */
export function RotateHint({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onClose, HIDE_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [onClose]);
  return (
    <div className="rotate-hint" role="status">
      <span className="rotate-hint-icon" aria-hidden>
        ⟳
      </span>
      <span className="rotate-hint-text">Rotate for bigger cards</span>
      <button type="button" className="rotate-hint-close" aria-label="Dismiss" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}

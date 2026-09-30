import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { Seat } from "../net/protocol";
import { CardTile } from "./CardTile";

type Props = {
  /** Def ids, newest-first (top of trash first). */
  cards: readonly string[];
  title: string;
  onClose: () => void;
  ownerSeat?: Seat;
  viewingSeat?: Seat;
  /** Ordering note after the count; "newest first" for the trash. */
  note?: string;
  emptyText?: string;
};

/** Public trash browser — both seats can open either pile. */
export function TrashViewer({
  cards,
  title,
  onClose,
  ownerSeat,
  viewingSeat,
  note = "newest first",
  emptyText = "No cards in trash.",
}: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="trash-viewer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div className="trash-viewer" onClick={(e) => e.stopPropagation()}>
        <div className="trash-viewer-toolbar">
          <div className="trash-viewer-heading">
            <h2 className="trash-viewer-title">{title}</h2>
            <p className="trash-viewer-sub">
              {cards.length === 0
                ? "Empty"
                : `${cards.length} card${cards.length === 1 ? "" : "s"}${note ? ` · ${note}` : ""}`}
            </p>
          </div>
          <button type="button" className="btn btn-primary trash-viewer-done" onClick={onClose}>
            Done
          </button>
        </div>
        {cards.length === 0 ? (
          <p className="trash-viewer-empty">{emptyText}</p>
        ) : (
          <div className="trash-viewer-grid">
            {cards.map((defId, i) => (
              <CardTile
                key={`${defId}-${i}`}
                defId={defId}
                compact
                inspectOnClick
                ownerSeat={ownerSeat}
                viewingSeat={viewingSeat}
              />
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Chronological trash (oldest→newest) → display order (newest first). */
export function trashNewestFirst(trash: readonly string[]): string[] {
  if (!trash.length) return [];
  return [...trash].reverse();
}

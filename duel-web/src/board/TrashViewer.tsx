import { useEffect, useState } from "react";
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
  /** Show the Newest / By card toggle (the real trash; not the face-up Life viewer). */
  sortable?: boolean;
};

export type TrashSort = "newest" | "card";

export const TRASH_SORT_KEY = "duel.trashSort";

export function readTrashSort(): TrashSort {
  try {
    return localStorage.getItem(TRASH_SORT_KEY) === "card" ? "card" : "newest";
  } catch {
    return "newest";
  }
}

export function writeTrashSort(sort: TrashSort): void {
  try {
    localStorage.setItem(TRASH_SORT_KEY, sort);
  } catch {
    /* private mode / blocked storage: the choice just won't persist */
  }
}

/**
 * One entry per distinct card, most copies first; equal counts keep the one
 * trashed most recently first (earliest index in the newest-first input).
 */
export function groupTrashByCard(newestFirst: readonly string[]): { defId: string; count: number }[] {
  const groups = new Map<string, { defId: string; count: number }>();
  for (const defId of newestFirst) {
    const g = groups.get(defId);
    if (g) g.count += 1;
    else groups.set(defId, { defId, count: 1 });
  }
  // Map keeps first-appearance order and sort is stable, so ties stay newest-first.
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/** Public trash browser — both seats can open either pile. */
export function TrashViewer(props: Props) {
  const { onClose, title } = props;
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
      <TrashViewerPanel {...props} />
    </div>,
    document.body,
  );
}

/** The panel itself (exported so it can be rendered without a portal in tests). */
export function TrashViewerPanel({
  cards,
  title,
  onClose,
  ownerSeat,
  viewingSeat,
  note = "newest first",
  emptyText = "No cards in trash.",
  sortable = false,
}: Props) {
  const [sort, setSort] = useState<TrashSort>(() => (sortable ? readTrashSort() : "newest"));
  const grouped = sortable && sort === "card";
  const groups = grouped ? groupTrashByCard(cards) : [];
  const pick = (next: TrashSort) => {
    setSort(next);
    writeTrashSort(next);
  };

  return (
    <div className={`trash-viewer${sortable ? " is-sortable" : ""}`} onClick={(e) => e.stopPropagation()}>
      <div className="trash-viewer-toolbar">
        <div className="trash-viewer-heading">
          <h2 className="trash-viewer-title">{title}</h2>
          <p className="trash-viewer-sub">
            {cards.length === 0
              ? "Empty"
              : `${cards.length} card${cards.length === 1 ? "" : "s"}${
                  grouped ? ` · ${groups.length} different` : note ? ` · ${note}` : ""
                }`}
          </p>
        </div>
        {sortable ? (
          <div className="trash-viewer-sort" role="group" aria-label="Sort trash">
            {(["newest", "card"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className="trash-viewer-sort-btn"
                aria-pressed={sort === v}
                onClick={() => pick(v)}
              >
                {v === "newest" ? "Newest" : "By card"}
              </button>
            ))}
          </div>
        ) : null}
        <button type="button" className="btn btn-primary trash-viewer-done" onClick={onClose}>
          Done
        </button>
      </div>
      {cards.length === 0 ? (
        <p className="trash-viewer-empty">{emptyText}</p>
      ) : (
        <div className="trash-viewer-grid">
          {grouped
            ? groups.map(({ defId, count }) => (
                <div key={defId} className="trash-viewer-cell">
                  <CardTile
                    defId={defId}
                    compact
                    inspectOnClick
                    ownerSeat={ownerSeat}
                    viewingSeat={viewingSeat}
                  />
                  {count > 1 ? (
                    <span className="trash-viewer-count" aria-label={`${count} copies`}>
                      ×{count}
                    </span>
                  ) : null}
                </div>
              ))
            : cards.map((defId, i) => (
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
  );
}

/** Chronological trash (oldest→newest) → display order (newest first). */
export function trashNewestFirst(trash: readonly string[]): string[] {
  if (!trash.length) return [];
  return [...trash].reverse();
}

import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { DON_CARD_ART } from "./donArt";
import { usePointerDrag } from "./usePointerDrag";

type DonToken = { id: string; rested: boolean };

type Props = {
  /** Full cost-area tokens when known (your side). */
  tokens?: DonToken[];
  /** Aggregate counts when only public info (opponent). */
  activeCount?: number;
  totalCount?: number;
  side: "you" | "opp";
  /** DON!! ids that have a legal give_don intent. */
  draggableDonIds?: ReadonlySet<string>;
  /** DON!! ids currently carried by an in-progress drag (for opacity). */
  draggingDonIds?: ReadonlySet<string>;
  /** DON!! ids toggled into the multi-select set. */
  selectedDonIds?: ReadonlySet<string>;
  onDonDragStart?: (donId: string) => void;
  onDonDragEnd?: (donId: string, clientX: number, clientY: number) => void;
  onDonDragCancel?: () => void;
  /** Tap/click a legal chip to toggle it into the multi-select set. */
  onDonToggleSelect?: (donId: string) => void;
  /** Tap the empty cost-area background to clear the multi-select set. */
  onClearDonSelection?: () => void;
};

function DonChip({
  token,
  canDrag,
  isDragging,
  isSelected,
  onDonDragStart,
  onDonDragEnd,
  onDonDragCancel,
  onToggleSelect,
}: {
  token: DonToken;
  canDrag: boolean;
  isDragging: boolean;
  isSelected: boolean;
  onDonDragStart?: (donId: string) => void;
  onDonDragEnd?: (donId: string, clientX: number, clientY: number) => void;
  onDonDragCancel?: () => void;
  onToggleSelect?: (donId: string) => void;
}) {
  const { bind, dragging } = usePointerDrag({
    enabled: canDrag,
    payload: token.id,
    onDragStart: onDonDragStart,
    onDragEnd: onDonDragEnd,
    onDragCancel: onDonDragCancel,
  });

  const className = `don-chip${token.rested ? " rested" : " active"}${
    canDrag ? " don-draggable" : ""
  }${dragging || isDragging ? " don-dragging" : ""}${isSelected ? " don-selected" : ""}`;

  const label = canDrag
    ? "Tap to select (tap again to add more), then tap a Leader or Character — or drag onto one"
    : token.rested
      ? "Rested DON!!"
      : "Active DON!!";

  // Button host (not bare <img>) so pointer capture / touch drag is reliable.
  return (
    <button
      type="button"
      className={`don-chip-btn${canDrag ? " is-draggable" : ""}${
        isSelected ? " is-selected" : ""
      }`}
      aria-label={label}
      aria-pressed={canDrag ? isSelected : undefined}
      title={label}
      // Never disabled: a choice that asks for DON!! (DON!! −N) picks chips
      // straight off the board, and disabled buttons get no clicks. Without a
      // give_don it has no click of its own, so it stays out of the Tab order.
      tabIndex={canDrag ? undefined : -1}
      data-don-id={token.id}
      data-don-rested={token.rested ? "true" : "false"}
      // Keep HTML5 DnD off; pointer drag owns the gesture.
      draggable={false}
      onClick={canDrag ? () => onToggleSelect?.(token.id) : undefined}
      {...bind}
    >
      <img src={DON_CARD_ART} alt="" className={className} draggable={false} />
    </button>
  );
}

export function DonStrip({
  tokens,
  activeCount,
  totalCount,
  side,
  draggableDonIds,
  draggingDonIds,
  selectedDonIds,
  onDonDragStart,
  onDonDragEnd,
  onDonDragCancel,
  onDonToggleSelect,
  onClearDonSelection,
}: Props) {
  const raw: DonToken[] =
    tokens ??
    Array.from({ length: totalCount ?? 0 }, (_, i) => ({
      id: `${side}-don-${i}`,
      rested: i >= (activeCount ?? 0),
    }));
  // Active DON!! first, rested after — reads like a real cost area and keeps
  // the rotated (wider) chips together at the end of the rail.
  const items = [...raw.filter((t) => !t.rested), ...raw.filter((t) => t.rested)];
  const restedCount = items.length - raw.filter((t) => !t.rested).length;
  // Chips overlap (never shrink) when the rail is too narrow; CSS derives the
  // overlap from the count and total footprint (rested chips are ~1.4 wide).
  const railStyle = {
    "--don-count": items.length,
    "--don-units": items.length - restedCount + restedCount * 1.4,
  } as CSSProperties;

  function handleRailClick(e: ReactMouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (!target.closest(".don-chip-btn")) {
      onClearDonSelection?.();
    }
  }

  return (
    <div className={`don-strip don-strip-${side}`} aria-label={`${side} DON cost area`}>
      <div className="don-strip-label">
        <span>DON!!</span>
        <span className="don-strip-nums">
          {tokens
            ? `${tokens.filter((t) => !t.rested).length}/${tokens.length}`
            : `${activeCount ?? 0}/${totalCount ?? 0}`}
        </span>
      </div>
      {selectedDonIds && selectedDonIds.size > 0 ? (
        // Absolutely positioned so it never nudges the rail.
        <span className="don-select-count" role="status">
          {selectedDonIds.size} selected
        </span>
      ) : null}
      <div className="don-strip-rail" style={railStyle} onClick={handleRailClick}>
        {items.length === 0 ? (
          <span className="don-empty">Empty</span>
        ) : (
          items.map((t) => {
            const canDrag = Boolean(draggableDonIds?.has(t.id));
            return (
              <DonChip
                key={t.id}
                token={t}
                canDrag={canDrag}
                isDragging={Boolean(draggingDonIds?.has(t.id))}
                isSelected={Boolean(selectedDonIds?.has(t.id))}
                onDonDragStart={onDonDragStart}
                onDonDragEnd={onDonDragEnd}
                onDonDragCancel={onDonDragCancel}
                onToggleSelect={onDonToggleSelect}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

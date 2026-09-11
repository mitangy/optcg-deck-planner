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
  /** Currently dragged don id (for opacity). */
  draggingDonId?: string | null;
  onDonDragStart?: (donId: string) => void;
  onDonDragEnd?: (donId: string, clientX: number, clientY: number) => void;
  onDonDragCancel?: () => void;
};

function DonChip({
  token,
  canDrag,
  isDragging,
  onDonDragStart,
  onDonDragEnd,
  onDonDragCancel,
}: {
  token: DonToken;
  canDrag: boolean;
  isDragging: boolean;
  onDonDragStart?: (donId: string) => void;
  onDonDragEnd?: (donId: string, clientX: number, clientY: number) => void;
  onDonDragCancel?: () => void;
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
  }${dragging || isDragging ? " don-dragging" : ""}`;

  // Button host (not bare <img>) so pointer capture / touch drag is reliable.
  return (
    <button
      type="button"
      className={`don-chip-btn${canDrag ? " is-draggable" : ""}`}
      aria-label={
        canDrag
          ? "Drag onto Leader or Character to give DON!!"
          : token.rested
            ? "Rested DON!!"
            : "Active DON!!"
      }
      title={
        canDrag
          ? "Drag onto Leader or Character to give DON!!"
          : token.rested
            ? "Rested DON!!"
            : "Active DON!!"
      }
      disabled={!canDrag}
      // Keep HTML5 DnD off; pointer drag owns the gesture.
      draggable={false}
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
  draggingDonId,
  onDonDragStart,
  onDonDragEnd,
  onDonDragCancel,
}: Props) {
  const items: DonToken[] =
    tokens ??
    Array.from({ length: totalCount ?? 0 }, (_, i) => ({
      id: `${side}-don-${i}`,
      rested: i >= (activeCount ?? 0),
    }));

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
      <div className="don-strip-rail">
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
                isDragging={draggingDonId === t.id}
                onDonDragStart={onDonDragStart}
                onDonDragEnd={onDonDragEnd}
                onDonDragCancel={onDonDragCancel}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

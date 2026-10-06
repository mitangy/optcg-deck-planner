import { useEffect, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { DON_CARD_ART } from "./donArt";
import { useClickCopy } from "./clickCopy";
import { groupIntoPiles, type DonPiles } from "./donPiles";
import { createLongPressController } from "./inspectGestures";
import { usePointerDrag } from "./usePointerDrag";

type DonToken = { id: string; rested: boolean };

type Props = {
  /** Full cost-area tokens when known (your side). */
  tokens?: DonToken[];
  /** Aggregate counts when only public info (opponent). */
  activeCount?: number;
  totalCount?: number;
  /** Denominator for the "active/total" label when it differs from the chip count (attached DON!! included). */
  labelTotal?: number;
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
  /** Piles your DON!! sit in (#381); with `onDonPileMove` the rail renders one group per pile. */
  donPiles?: DonPiles;
  /** Right-click / long-press a chip: offset it (and the selection it is in) to another pile. */
  onDonPileMove?: (donId: string) => void;
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
  onPileMove,
}: {
  token: DonToken;
  canDrag: boolean;
  isDragging: boolean;
  isSelected: boolean;
  onDonDragStart?: (donId: string) => void;
  onDonDragEnd?: (donId: string, clientX: number, clientY: number) => void;
  onDonDragCancel?: () => void;
  onToggleSelect?: (donId: string) => void;
  onPileMove?: (donId: string) => void;
}) {
  const copy = useClickCopy();
  const pileMoveRef = useRef(onPileMove);
  pileMoveRef.current = onPileMove;
  const longPressRef = useRef<ReturnType<typeof createLongPressController> | null>(null);
  if (longPressRef.current == null) {
    longPressRef.current = createLongPressController({
      onLongPress: () => pileMoveRef.current?.(token.id),
    });
  }
  useEffect(() => {
    const lp = longPressRef.current;
    return () => lp?.dispose();
  }, []);
  const { bind, dragging } = usePointerDrag({
    enabled: canDrag,
    payload: token.id,
    onDragStart: (id) => {
      // A drag that has begun is not a long-press.
      longPressRef.current?.cancel();
      onDonDragStart?.(id);
    },
    onDragEnd: onDonDragEnd,
    onDragCancel: onDonDragCancel,
  });

  const className = `don-chip${token.rested ? " rested" : " active"}${
    canDrag ? " don-draggable" : ""
  }${dragging || isDragging ? " don-dragging" : ""}${isSelected ? " don-selected" : ""}`;

  const pileHint = onPileMove ? "right-click (long-press on phones) to move to another pile" : "";
  const label = canDrag
    ? copy(
        `Tap to select (tap again to add more), then tap a Leader or Character — or drag onto one${
          pileHint ? `; ${pileHint}` : ""
        }`,
      )
    : `${token.rested ? "Rested DON!!" : "Active DON!!"}${pileHint ? ` — ${pileHint}` : ""}`;

  // Touch / pen long-press moves the chip; a mouse uses right-click instead.
  const { onPointerDown: dragDown, onPointerMove: dragMove, onPointerUp: dragUp, onPointerCancel: dragCancel, ...dragRest } =
    bind as Partial<Record<"onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel", (e: ReactPointerEvent) => void>> &
      Record<string, unknown>;
  const lp = longPressRef.current!;
  const pointerHandlers = {
    onPointerDown: (e: ReactPointerEvent) => {
      if (onPileMove && e.pointerType !== "mouse") lp.onPointerDown(e);
      dragDown?.(e);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      lp.onPointerMove(e);
      dragMove?.(e);
    },
    onPointerUp: (e: ReactPointerEvent) => {
      lp.onPointerUp(e);
      dragUp?.(e);
    },
    onPointerCancel: (e: ReactPointerEvent) => {
      lp.onPointerCancel(e);
      dragCancel?.(e);
    },
  };

  function handleClick(e: ReactMouseEvent) {
    // The long-press already moved the chip: do not also toggle selection.
    if (lp.consumeActivated()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (canDrag) onToggleSelect?.(token.id);
  }

  function handleContextMenu(e: ReactMouseEvent) {
    if (!onPileMove) return;
    e.preventDefault();
    // Touch browsers also fire contextmenu after a long-press that already moved it.
    if (lp.activated) return;
    onPileMove(token.id);
  }

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
      onClick={onPileMove || canDrag ? handleClick : undefined}
      onContextMenu={onPileMove ? handleContextMenu : undefined}
      {...dragRest}
      {...pointerHandlers}
    >
      <img src={DON_CARD_ART} alt="" className={className} draggable={false} />
    </button>
  );
}

export function DonStrip({
  tokens,
  activeCount,
  totalCount,
  labelTotal,
  side,
  draggableDonIds,
  draggingDonIds,
  selectedDonIds,
  onDonDragStart,
  onDonDragEnd,
  onDonDragCancel,
  onDonToggleSelect,
  onClearDonSelection,
  donPiles,
  onDonPileMove,
}: Props) {
  const raw: DonToken[] =
    tokens ??
    Array.from({ length: totalCount ?? 0 }, (_, i) => ({
      id: `${side}-don-${i}`,
      rested: i >= (activeCount ?? 0),
    }));
  // Active DON!! first, rested after — reads like a real cost area and keeps
  // the rotated (wider) chips together at the end of the rail.
  const piled = Boolean(tokens && onDonPileMove);
  const groups = groupIntoPiles(raw, piled ? (donPiles ?? {}) : {});
  const items = groups.flat();
  const restedCount = items.length - raw.filter((t) => !t.rested).length;
  // Chips overlap (never shrink) when the rail is too narrow; CSS derives the
  // overlap from the count and total footprint (rested chips are ~1.4 wide).
  const railStyle = {
    "--don-count": items.length,
    "--don-units": items.length - restedCount + restedCount * 1.4,
    // Chips overlap only within a pile; the gap between piles is fixed.
    "--don-piles": Math.max(groups.length, 1),
    "--don-gaps": Math.max(groups.length - 1, 0),
  } as CSSProperties;

  function handleRailClick(e: ReactMouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (!target.closest(".don-chip-btn")) {
      onClearDonSelection?.();
    }
  }

  function renderChip(t: DonToken) {
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
        onPileMove={piled ? onDonPileMove : undefined}
      />
    );
  }

  function renderGroups() {
    // One pile lays out exactly as a plain rail; wrappers only appear for 2+.
    if (groups.length <= 1) return items.map(renderChip);
    return groups.map((g, i) => (
      <div key={i} className="don-pile" data-don-pile={i}>
        {g.map(renderChip)}
      </div>
    ));
  }

  return (
    <div className={`don-strip don-strip-${side}`} aria-label={`${side} DON cost area`}>
      <div className="don-strip-label">
        <span>DON!!</span>
        <span className="don-strip-nums">
          {tokens
            ? `${tokens.filter((t) => !t.rested).length}/${labelTotal ?? tokens.length}`
            : `${activeCount ?? 0}/${labelTotal ?? totalCount ?? 0}`}
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
          renderGroups()
        )}
      </div>
    </div>
  );
}

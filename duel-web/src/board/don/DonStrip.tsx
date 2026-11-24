import { useEffect, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { DON_CARD_ART, fallbackToDefaultDon } from "./donArt";
import { useClickCopy } from "../input/clickCopy";
import { groupIntoPiles, type DonPiles } from "./donPiles";
import { railTapDon } from "./donSelection";
import { createLongPressController } from "../preview/inspectGestures";
import { usePointerDrag } from "../input/usePointerDrag";

type DonToken = { id: string; rested: boolean };

type Props = {
  tokens?: DonToken[];
  activeCount?: number;
  totalCount?: number;
  labelTotal?: number;
  side: "you" | "opp";
  donArt?: string;
  draggableDonIds?: ReadonlySet<string>;
  draggingDonIds?: ReadonlySet<string>;
  selectedDonIds?: ReadonlySet<string>;
  onDonDragStart?: (donId: string) => void;
  onDonDragEnd?: (donId: string, clientX: number, clientY: number) => void;
  onDonDragCancel?: () => void;
  onDonToggleSelect?: (donId: string) => void;
  onClearDonSelection?: () => void;
  donPiles?: DonPiles;
  onDonPileMove?: (donId: string) => void;
};

function DonChip({
  token,
  art,
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
  art: string;
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
    if (lp.activated) return;
    onPileMove(token.id);
  }

  return (
    <button
      type="button"
      className={`don-chip-btn${canDrag ? " is-draggable" : ""}${
        isSelected ? " is-selected" : ""
      }`}
      aria-label={label}
      aria-pressed={canDrag ? isSelected : undefined}
      title={label}
      tabIndex={canDrag ? undefined : -1}
      data-don-id={token.id}
      data-don-rested={token.rested ? "true" : "false"}
      draggable={false}
      onClick={onPileMove || canDrag ? handleClick : undefined}
      onContextMenu={onPileMove ? handleContextMenu : undefined}
      {...dragRest}
      {...pointerHandlers}
    >
      <img
        src={art}
        alt=""
        className={className}
        draggable={false}
        onError={fallbackToDefaultDon}
      />
    </button>
  );
}

export function DonStrip({
  donArt = DON_CARD_ART,
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
  const piled = Boolean(tokens && onDonPileMove);
  const groups = groupIntoPiles(raw, piled ? (donPiles ?? {}) : {});
  const items = groups.flat();
  const restedCount = items.length - raw.filter((t) => !t.rested).length;
  const railStyle = {
    "--don-count": items.length,
    "--don-units": items.length - restedCount + restedCount * 1.4,
    "--don-piles": Math.max(groups.length, 1),
    "--don-gaps": Math.max(groups.length - 1, 0),
  } as CSSProperties;

  function handleRailClick(e: ReactMouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest(".don-chip-btn")) return;
    const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    const legal = touch && onDonToggleSelect ? items.filter((t) => draggableDonIds?.has(t.id)).map((t) => t.id) : [];
    if (legal.length === 0) {
      onClearDonSelection?.();
      return;
    }
    const next = railTapDon(selectedDonIds ?? new Set(), legal);
    if (next) onDonToggleSelect?.(next);
    else onClearDonSelection?.();
  }

  function renderChip(t: DonToken) {
    const canDrag = Boolean(draggableDonIds?.has(t.id));
    return (
      <DonChip
        art={donArt}
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

import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { resolveCardImageUrl } from "../decks/artPrefs";
import { lookupCard } from "../cards/atlas";
import { CardInspect } from "./CardInspect";
import { createClickDeferController, createLongPressController } from "./inspectGestures";

const COLOR_CHIP: Record<string, string> = {
  red: "#c62828",
  green: "#2e7d32",
  blue: "#1565c0",
  purple: "#6a1b9a",
  black: "#212121",
  yellow: "#f9a825",
};

type Props = {
  defId: string;
  rested?: boolean;
  power?: number;
  attachedDonCount?: number;
  compact?: boolean;
  selected?: boolean;
  frame?: "default" | "leader";
  /** Primary click (hand select / intent targeting). */
  onClick?: () => void;
  /** When true, click opens inspect instead of onClick (board cards). */
  inspectOnClick?: boolean;
};

export function CardTile({
  defId,
  rested,
  power,
  attachedDonCount,
  compact,
  selected,
  frame = "default",
  onClick,
  inspectOnClick = false,
}: Props) {
  const entry = useMemo(() => lookupCard(defId), [defId]);
  const [imgFailed, setImgFailed] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [artTick, setArtTick] = useState(0);
  const imageUrl = useMemo(() => {
    void artTick;
    return resolveCardImageUrl(defId);
  }, [defId, artTick]);
  const chip = COLOR_CHIP[entry.colors[0] ?? ""] ?? "#455a64";
  const shownPower = power ?? entry.power ?? null;
  const className = [
    "card-tile",
    compact ? "compact" : "full",
    selected ? "selected" : "",
    rested ? "rested" : "",
    frame === "leader" ? "leader-frame" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  const openInspectRef = useRef(() => setInspectOpen(true));
  openInspectRef.current = () => setInspectOpen(true);

  const longPressRef = useRef<ReturnType<typeof createLongPressController> | null>(null);
  if (longPressRef.current == null) {
    longPressRef.current = createLongPressController({
      onLongPress: () => openInspectRef.current(),
    });
  }

  const clickDeferRef = useRef<ReturnType<typeof createClickDeferController> | null>(null);
  if (clickDeferRef.current == null) {
    clickDeferRef.current = createClickDeferController({
      onSingleClick: () => onClickRef.current?.(),
    });
  }

  useEffect(() => {
    const lp = longPressRef.current;
    const defer = clickDeferRef.current;
    return () => {
      lp?.dispose();
      defer?.dispose();
    };
  }, []);

  function openInspectFromChip(e?: MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    clickDeferRef.current?.cancel();
    setInspectOpen(true);
  }

  function handleClick(e: MouseEvent) {
    // Long-press already opened inspect — suppress the synthetic click.
    if (longPressRef.current?.consumeActivated()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (inspectOnClick) {
      setInspectOpen(true);
      return;
    }
    if (onClick) {
      clickDeferRef.current?.onClick();
    }
  }

  function handleDoubleClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    clickDeferRef.current?.cancel();
    setInspectOpen(true);
  }

  function handlePointerDown(e: PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    longPressRef.current?.onPointerDown(e);
  }

  function handlePointerMove(e: PointerEvent) {
    longPressRef.current?.onPointerMove(e);
  }

  function handlePointerUp(e: PointerEvent) {
    longPressRef.current?.onPointerUp(e);
  }

  function handlePointerCancel(e: PointerEvent) {
    longPressRef.current?.onPointerCancel(e);
  }

  const interactive = Boolean(onClick || inspectOnClick);
  const showInspectChip = !inspectOnClick;

  const body = (
    <>
      {!imgFailed && imageUrl ? (
        <img
          src={imageUrl}
          alt={entry.name}
          onError={() => setImgFailed(true)}
          onLoad={() => setArtTick((n) => n)}
          draggable={false}
        />
      ) : (
        <div className="card-fallback" style={{ backgroundColor: chip }}>
          {entry.id}
        </div>
      )}
      {shownPower != null ? <span className="power-badge">{shownPower}</span> : null}
      {attachedDonCount ? <span className="don-badge">DON×{attachedDonCount}</span> : null}
      <div className="card-caption">
        <div className="name">{entry.name}</div>
        <div className="meta">{`C${entry.cost}`}</div>
      </div>
      {showInspectChip ? (
        // Quiet keyboard-accessible control — prefer double-click / long-press.
        <span
          role="button"
          tabIndex={0}
          className="card-inspect-chip"
          title="Inspect card (or double-click / long-press)"
          aria-label={`Inspect ${entry.name}`}
          onClick={openInspectFromChip}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openInspectFromChip(e as unknown as MouseEvent);
            }
          }}
        >
          i
        </span>
      ) : null}
    </>
  );

  const pointerHandlers = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onDoubleClick: handleDoubleClick,
  };

  return (
    <>
      {interactive ? (
        <button type="button" className={className} onClick={handleClick} {...pointerHandlers}>
          {body}
        </button>
      ) : (
        <div className={className} {...pointerHandlers}>
          {body}
        </div>
      )}
      <CardInspect
        defId={defId}
        open={inspectOpen}
        onClose={() => {
          setInspectOpen(false);
          setArtTick((n) => n + 1);
        }}
      />
    </>
  );
}

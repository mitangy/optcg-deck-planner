import { useMemo, useState, type MouseEvent } from "react";
import { resolveCardImageUrl } from "../decks/artPrefs";
import { lookupCard } from "../cards/atlas";
import { CardInspect } from "./CardInspect";
import { usePointerDrag } from "./usePointerDrag";

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
  /** HTML5 drag stays off; pointer drag when set. */
  dragEnabled?: boolean;
  dragPayload?: unknown;
  onDragStart?: () => void;
  onDragEnd?: (clientX: number, clientY: number) => void;
  onDragCancel?: () => void;
  /** data-dnd-drop value for give_don / play_trash targets. */
  dropAttr?: string | null;
  dropHighlight?: boolean;
  classNameExtra?: string;
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
  dragEnabled = false,
  dragPayload,
  onDragStart,
  onDragEnd,
  onDragCancel,
  dropAttr,
  dropHighlight = false,
  classNameExtra,
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

  const { bind: dragBind, dragging } = usePointerDrag({
    enabled: dragEnabled,
    payload: dragPayload ?? null,
    onDragStart: () => onDragStart?.(),
    onDragEnd: (_p, x, y) => onDragEnd?.(x, y),
    onDragCancel,
  });

  const className = [
    "card-tile",
    compact ? "compact" : "full",
    selected ? "selected" : "",
    rested ? "rested" : "",
    frame === "leader" ? "leader-frame" : "",
    dropHighlight ? "drop-highlight" : "",
    dragEnabled ? "card-draggable" : "",
    dragging ? "card-dragging" : "",
    classNameExtra ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  function openInspect(e?: MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    setInspectOpen(true);
  }

  function handleClick() {
    if (inspectOnClick) {
      setInspectOpen(true);
      return;
    }
    onClick?.();
  }

  const body = (
    <>
      {!imgFailed && imageUrl ? (
        <img
          src={imageUrl}
          alt={entry.name}
          draggable={false}
          onError={() => setImgFailed(true)}
          onLoad={() => setArtTick((n) => n)}
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
      {!inspectOnClick ? (
        // span (not button) — parent tile may already be a <button>
        <span
          role="button"
          tabIndex={0}
          className="card-inspect-chip"
          title="Inspect card"
          aria-label={`Inspect ${entry.name}`}
          onClick={openInspect}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") openInspect(e as unknown as MouseEvent);
          }}
        >
          i
        </span>
      ) : null}
    </>
  );

  const dropProps = dropAttr ? { "data-dnd-drop": dropAttr } : {};

  return (
    <>
      {onClick || inspectOnClick || dragEnabled ? (
        <button
          type="button"
          className={className}
          onClick={handleClick}
          draggable={false}
          {...dropProps}
          {...dragBind}
        >
          {body}
        </button>
      ) : (
        <div className={className} {...dropProps}>
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

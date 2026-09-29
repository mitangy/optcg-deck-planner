import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { resolveCardImageUrl } from "../decks/artPrefs";
import { isTcgplayerCdnUrl, localCardArtPath } from "../cards/cardImage";
import {
  getArtPrefsTick,
  subscribeArtPrefs,
  type Seat,
} from "../decks/seatArtPrefs";
import { lookupCard } from "../cards/atlas";
import { CardInspect } from "./CardInspect";
import { refreshPreviewLive, setPreviewCard, type PreviewLive } from "./cardPreview";
import { counterValueFor, formatCounter } from "../cards/counterValue";
import { formatPowerDelta, powerBreakdown, tileStatusLabels } from "./powerDisplay";
import {
  createClickDeferController,
  createLongPressController,
} from "./inspectGestures";
import { usePointerDrag } from "./usePointerDrag";

const COLOR_CHIP: Record<string, string> = {
  red: "#c62828",
  green: "#2e7d32",
  blue: "#1565c0",
  purple: "#6a1b9a",
  black: "#212121",
  yellow: "#f9a825",
};

/** CSS modifier for status / CC chips (stun, unrestable, …). */
function slugStatus(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

type Props = {
  defId: string;
  rested?: boolean;
  power?: number;
  printedPower?: number | null;
  attachedDonCount?: number;
  compact?: boolean;
  selected?: boolean;
  frame?: "default" | "leader";
  /** Status / CC chips (Rested, Summoning sick, Stun, …). */
  statusLabels?: string[];
  /** Primary click (hand select / intent targeting). */
  onClick?: () => void;
  /** When true, single click opens inspect instead of onClick (trash viewer only). */
  inspectOnClick?: boolean;
  /** Long-press / double-click inspect when true (field cards without onClick). */
  inspectGestures?: boolean;
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
  /** Seat that owns this card instance (art resolution). */
  ownerSeat?: Seat;
  /** Seat controlling the UI (alt-art picker writes here). */
  viewingSeat?: Seat;
  /** Server-authoritative play cost (Teach tax, etc.) when in Main. */
  playCost?: number;
  /** Field instance id — hover preview tracks this card's live power/statuses. */
  instanceId?: string;
  /** Show the Counter value badge (hand cards). */
  showCounter?: boolean;
};

export function CardTile({
  defId,
  rested,
  power,
  printedPower,
  attachedDonCount,
  compact,
  selected,
  frame = "default",
  statusLabels,
  onClick,
  inspectOnClick = false,
  inspectGestures = false,
  dragEnabled = false,
  dragPayload,
  onDragStart,
  onDragEnd,
  onDragCancel,
  dropAttr,
  dropHighlight = false,
  classNameExtra,
  ownerSeat,
  viewingSeat,
  playCost,
  instanceId,
  showCounter = false,
}: Props) {
  const entry = useMemo(() => lookupCard(defId), [defId]);
  const [imgFailed, setImgFailed] = useState(false);
  const [localFallback, setLocalFallback] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const artTick = useSyncExternalStore(
    subscribeArtPrefs,
    getArtPrefsTick,
    getArtPrefsTick,
  );
  const imageUrl = useMemo(() => {
    void artTick;
    if (localFallback) return localCardArtPath(defId);
    return resolveCardImageUrl(defId, { ownerSeat, size: "thumb" });
  }, [defId, artTick, localFallback, ownerSeat]);

  useEffect(() => {
    setImgFailed(false);
    setLocalFallback(false);
  }, [defId]);

  const chip = COLOR_CHIP[entry.colors[0] ?? ""] ?? "#455a64";
  const pb = powerBreakdown(power, printedPower, entry.power);
  const counter = useMemo(
    () => (showCounter ? counterValueFor(entry) : null),
    [showCounter, entry],
  );
  const labels = tileStatusLabels(statusLabels, rested);

  // Live in-play state for the hover preview (field instances only).
  const labelsKey = (statusLabels ?? []).join("|");
  const live = useMemo<PreviewLive | undefined>(
    () =>
      instanceId
        ? { power, printedPower, attachedDonCount, rested, statusLabels }
        : undefined,
    // statusLabels is a fresh array each render; labelsKey tracks its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [instanceId, power, printedPower, attachedDonCount, rested, labelsKey],
  );
  useEffect(() => {
    if (instanceId && live) refreshPreviewLive(instanceId, live);
  }, [instanceId, live]);

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

  const { bind: dragBind, dragging } = usePointerDrag({
    enabled: dragEnabled,
    payload: dragPayload ?? null,
    onDragStart: () => {
      // Drag arms at 8px; long-press cancel is 12px — abort inspect once drag starts.
      longPressRef.current?.cancel();
      clickDeferRef.current?.cancel();
      onDragStart?.();
    },
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
    dragBind.onPointerDown?.(e);
  }

  function handlePointerMove(e: PointerEvent) {
    longPressRef.current?.onPointerMove(e);
    dragBind.onPointerMove?.(e);
  }

  function handlePointerUp(e: PointerEvent) {
    longPressRef.current?.onPointerUp(e);
    dragBind.onPointerUp?.(e);
  }

  function handlePointerEnter(e: PointerEvent) {
    if (e.pointerType === "mouse") setPreviewCard({ defId, ownerSeat, instanceId, live });
  }

  function handlePointerCancel(e: PointerEvent) {
    longPressRef.current?.onPointerCancel(e);
    dragBind.onPointerCancel?.(e);
  }

  function handleImgError() {
    const primary = resolveCardImageUrl(defId, { ownerSeat, size: "thumb" });
    if (!localFallback && isTcgplayerCdnUrl(primary)) {
      setLocalFallback(true);
      return;
    }
    setImgFailed(true);
  }

  const canInspect =
    inspectOnClick || inspectGestures || Boolean(onClick) || dragEnabled;
  const interactive = Boolean(onClick || inspectOnClick || dragEnabled || inspectGestures);
  const showInspectChip = canInspect && !inspectOnClick;

  const body = (
    <>
      {!imgFailed && imageUrl ? (
        <img
          src={imageUrl}
          alt={entry.name}
          onError={handleImgError}
          draggable={false}
        />
      ) : (
        <div className="card-fallback" style={{ backgroundColor: chip }}>
          {entry.id}
        </div>
      )}
      {/* Badges live in an overlay that counter-rotates on rested (sideways)
          tiles so power / DON!! / statuses stay upright and readable. */}
      <div className="card-overlays">
        {pb || counter || attachedDonCount ? (
          <div className="card-stat-stack">
            {pb ? (
              <span
                className={`power-badge${pb.delta !== 0 ? " power-badge-buffed" : ""}`}
                title={
                  pb.delta !== 0
                    ? `Power ${pb.current} (base ${pb.base} ${formatPowerDelta(pb.delta)})`
                    : `Power ${pb.current}`
                }
              >
                <span className="power-base">{pb.base}</span>
                {pb.delta !== 0 ? (
                  <span className={`power-mod ${pb.delta > 0 ? "power-mod-up" : "power-mod-down"}`}>
                    {formatPowerDelta(pb.delta)}
                  </span>
                ) : null}
              </span>
            ) : null}
            {counter ? (
              <span
                className={`power-badge counter-badge${counter.effectOnly ? " counter-badge-effect" : ""}`}
                title={
                  counter.effectOnly
                    ? "[Counter] event (no power boost)"
                    : counter.boosted != null
                      ? `Counter ${formatCounter(counter)} (higher value when its condition is met)`
                      : `Counter ${formatCounter(counter)}`
                }
              >
                {formatCounter(counter)
                  .split(" / ")
                  .map((part, i) => (
                    <span key={i} className="counter-part">
                      {i > 0 ? "/" : ""}
                      {part}
                    </span>
                  ))}
              </span>
            ) : null}
            {/* Stacked under power so narrow (mobile) tiles never overlap badges. */}
            {attachedDonCount ? <span className="don-badge">DON×{attachedDonCount}</span> : null}
          </div>
        ) : null}
        {labels.length ? (
          <div className="status-chips" aria-label="Card statuses">
            {labels.map((label) => (
              <span
                key={label}
                className={`status-chip status-chip-${slugStatus(label)}`}
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="card-caption">
        <div className="name">{entry.name}</div>
        <div
          className={`meta${playCost != null && playCost !== entry.cost ? " meta-cost-modified" : ""}`}
          title={
            playCost != null && playCost !== entry.cost
              ? `Effective cost ${playCost} (printed ${entry.cost})`
              : undefined
          }
        >
          {playCost != null && playCost !== entry.cost
            ? `Cost ${playCost}`
            : `Cost ${entry.cost}`}
        </div>
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

  const dropProps = dropAttr ? { "data-dnd-drop": dropAttr } : {};
  const pointerHandlers = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onPointerEnter: handlePointerEnter,
    onDoubleClick: handleDoubleClick,
  };

  return (
    <>
      {interactive ? (
        <button
          type="button"
          className={className}
          onClick={handleClick}
          onClickCapture={dragBind.onClickCapture}
          draggable={false}
          style={dragBind.style}
          {...dropProps}
          {...pointerHandlers}
        >
          {body}
        </button>
      ) : (
        <div className={className} {...dropProps} {...pointerHandlers}>
          {body}
        </div>
      )}
      <CardInspect
        defId={defId}
        open={inspectOpen}
        onClose={() => setInspectOpen(false)}
        ownerSeat={ownerSeat}
        viewingSeat={viewingSeat ?? ownerSeat}
        live={live}
      />
    </>
  );
}

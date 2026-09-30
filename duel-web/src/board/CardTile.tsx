import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
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
import { costBreakdown, formatPowerDelta, powerBreakdown, tileStatusLabels } from "./powerDisplay";
import {
  createClickDeferController,
  createLongPressController,
  inspectOnContextMenu,
} from "./inspectGestures";
import { usePointerDrag } from "./usePointerDrag";
import { StatusRow } from "./StatusIcon";

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
  printedPower?: number | null;
  /** Live cost of a Character in play (includes +cost effects). */
  fieldCost?: number;
  attachedDonCount?: number;
  compact?: boolean;
  selected?: boolean;
  frame?: "default" | "leader";
  /** Status / CC chips (Rested, Summoning sick, Stun, …). */
  statusLabels?: string[];
  /** Primary click (hand select / intent targeting). */
  onClick?: () => void;
  /**
   * Fire onClick immediately instead of waiting out the double-click window.
   * Use for idempotent toggles (select/deselect) so the highlight is instant —
   * a double-click toggles twice (no net change) and then opens inspect.
   * Leave off for one-shot actions (e.g. declaring an attack on a target).
   */
  instantClick?: boolean;
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
  /** touch-action before a drag lifts (default pan-x, for scrolling hand rows). */
  dragTouchAction?: "pan-x" | "pan-y" | "none";
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
  /** Board instance id → `data-instance-id` (battle overlay anchor) + live hover preview tracking. */
  instanceId?: string;
  /** Hand card id → `data-motion-id`, so draw / play / discard animations can find it. */
  motionId?: string;
  /** Show the Counter value badge (hand cards). */
  showCounter?: boolean;
  /** Inline custom properties (hand fan pose). */
  style?: CSSProperties;
};

export function CardTile({
  defId,
  rested,
  power,
  printedPower,
  fieldCost,
  attachedDonCount,
  compact,
  selected,
  frame = "default",
  statusLabels,
  onClick,
  instantClick = false,
  instanceId,
  motionId,
  inspectOnClick = false,
  inspectGestures = false,
  dragEnabled = false,
  dragPayload,
  onDragStart,
  onDragEnd,
  onDragCancel,
  dragTouchAction,
  dropAttr,
  dropHighlight = false,
  classNameExtra,
  ownerSeat,
  viewingSeat,
  playCost,
  showCounter = false,
  style,
}: Props) {
  const entry = useMemo(() => lookupCard(defId), [defId]);
  // Failure state is keyed by URL (not defId) so picking a different alt art
  // after a failed load gets a fresh attempt instead of staying on the fallback.
  const [failedSrc, setFailedSrc] = useState<string | null | undefined>(null);
  const [localFallbackFor, setLocalFallbackFor] = useState<string | null | undefined>(null);
  const [inspectOpen, setInspectOpen] = useState(false);
  const artTick = useSyncExternalStore(
    subscribeArtPrefs,
    getArtPrefsTick,
    getArtPrefsTick,
  );
  const primaryUrl = useMemo(() => {
    void artTick;
    return resolveCardImageUrl(defId, { ownerSeat, size: "thumb" });
  }, [defId, artTick, ownerSeat]);
  const imageUrl =
    localFallbackFor === primaryUrl ? localCardArtPath(defId) : primaryUrl;
  const imgFailed = failedSrc != null && failedSrc === imageUrl;

  const chip = COLOR_CHIP[entry.colors[0] ?? ""] ?? "#455a64";
  const pb = powerBreakdown(power, printedPower, entry.power);
  const cb = costBreakdown(fieldCost, entry.cost);
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
        ? { power, printedPower, fieldCost, attachedDonCount, rested, statusLabels }
        : undefined,
    // statusLabels is a fresh array each render; labelsKey tracks its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [instanceId, power, printedPower, fieldCost, attachedDonCount, rested, labelsKey],
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
    idleTouchAction: dragTouchAction,
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
      if (instantClick) onClickRef.current?.();
      else clickDeferRef.current?.onClick();
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
    // Mouse press-and-hold on a draggable card is the start of a drag, not an
    // inspect (desktop inspects via double-click / the "i" chip).
    if (!(e.pointerType === "mouse" && dragEnabled)) {
      longPressRef.current?.onPointerDown(e);
    }
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
    if (localFallbackFor !== primaryUrl && isTcgplayerCdnUrl(primaryUrl)) {
      setLocalFallbackFor(primaryUrl);
      return;
    }
    setFailedSrc(imageUrl);
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
                  // Narrow (phone) tiles show only this, so the stack stays short
                  // enough for the status row under it (see .card-overlays).
                  <span className={`power-now ${pb.delta > 0 ? "power-mod-up" : "power-mod-down"}`}>
                    {pb.current}
                  </span>
                ) : null}
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
            {attachedDonCount ? (
              <span className="don-badge" aria-label={`DON!! ×${attachedDonCount}`}>
                <span className="don-badge-word">DON</span>×{attachedDonCount}
              </span>
            ) : null}
          </div>
        ) : null}
        {labels.length ? (
          <StatusRow
            labels={labels}
            stackKey={`${pb?.current ?? ""}/${pb?.delta ?? 0}/${counter ? formatCounter(counter) : ""}/${attachedDonCount ?? 0}`}
          />
        ) : null}
      </div>
      <div className="card-caption">
        <div className="name">{entry.name}</div>
        <div
          className={`meta${!(cb && cb.delta !== 0) && playCost != null && playCost !== entry.cost ? " meta-cost-modified" : ""}`}
          title={
            cb && cb.delta !== 0
              ? `Cost ${cb.current} (printed ${cb.base}, ${formatPowerDelta(cb.delta)})`
              : playCost != null && playCost !== entry.cost
                ? `Effective cost ${playCost} (printed ${entry.cost})`
                : undefined
          }
        >
          {cb && cb.delta !== 0
            ? (
                <>
                  {`Cost ${cb.base} `}
                  <span className={cb.delta > 0 ? "power-mod-up" : "power-mod-down"}>
                    {formatPowerDelta(cb.delta)}
                  </span>
                </>
              )
            : playCost != null && playCost !== entry.cost
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

  const dropProps = {
    ...(dropAttr ? { "data-dnd-drop": dropAttr } : {}),
    ...(instanceId ? { "data-instance-id": instanceId } : {}),
    ...(motionId ? { "data-motion-id": motionId } : {}),
  };
  const pointerHandlers = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onPointerEnter: handlePointerEnter,
    onDoubleClick: handleDoubleClick,
    onContextMenu: (e: MouseEvent) => {
      clickDeferRef.current?.cancel();
      inspectOnContextMenu(e, () => setInspectOpen(true));
    },
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
          style={style ? { ...style, ...dragBind.style } : dragBind.style}
          {...dropProps}
          {...pointerHandlers}
        >
          {body}
        </button>
      ) : (
        <div className={className} style={style} {...dropProps} {...pointerHandlers}>
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

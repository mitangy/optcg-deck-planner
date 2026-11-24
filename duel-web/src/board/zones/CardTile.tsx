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
import { blockedTitle, handCostCaption, type HandBlock } from "../hand/handAffordance";
import { resolveCardImageUrl } from "../../decks/artPrefs";
import { artAfterError, isLocalCardsUrl, isPlaceholderArt, isTcgplayerCdnUrl } from "@optcg/ui/cardArt";
import {
  getArtPrefsTick,
  subscribeArtPrefs,
  type Seat,
} from "../../decks/seatArtPrefs";
import { lookupCard } from "../../cards/atlas";
import { CardInspect } from "../preview/CardInspect";
import { endPreviewHover, hoverPreviewCard, refreshPreviewLive, type PreviewLive } from "../preview/cardPreview";
import { counterValueFor, formatCounter } from "../../cards/counterValue";
import { costBreakdown, formatPowerDelta, powerBreakdown, tileStatusLabels } from "../preview/powerDisplay";
import {
  createClickDeferController,
  DOUBLE_CLICK_DELAY_MS,
  createLongPressController,
  inspectOnContextMenu,
  isInspectKey,
} from "../preview/inspectGestures";
import { usePointerDrag } from "../input/usePointerDrag";
import { StatusRow } from "../panels/StatusIcon";
import { donUnderLayers } from "../don/donUnder";
import { cardAriaLabel } from "./cardLabel";

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
  fieldCost?: number;
  attachedDonCount?: number;
  compact?: boolean;
  selected?: boolean;
  frame?: "default" | "leader";
  statusLabels?: string[];
  onClick?: () => void;
  // Idempotent toggles: a double-click toggles twice (no net change) and then opens inspect, so firing immediately is safe.
  instantClick?: boolean;
  // Timed here, not from `dblclick`: iOS doesn't reliably fire it.
  onDoubleActivate?: () => void;
  inspectOnClick?: boolean;
  inspectGestures?: boolean;
  dragEnabled?: boolean;
  dragPayload?: unknown;
  onDragStart?: () => void;
  onDragEnd?: (clientX: number, clientY: number) => void;
  onDragCancel?: () => void;
  dragTouchAction?: "pan-x" | "pan-y" | "none";
  dropAttr?: string | null;
  dropHighlight?: boolean;
  classNameExtra?: string;
  ownerSeat?: Seat;
  artCopy?: number;
  viewingSeat?: Seat;
  playCost?: number;
  blocked?: HandBlock;
  instanceId?: string;
  motionId?: string;
  showCounter?: boolean;
  revealed?: boolean;
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
  onDoubleActivate,
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
  artCopy,
  viewingSeat,
  playCost,
  blocked,
  showCounter = false,
  revealed = false,
  style,
}: Props) {
  const entry = useMemo(() => lookupCard(defId), [defId]);
  // Keyed by URL (not defId) so picking a different alt art after a failed load gets a fresh attempt.
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
    return resolveCardImageUrl(defId, { ownerSeat, artCopy, size: "thumb" });
  }, [defId, artTick, ownerSeat, artCopy]);
  const imageUrl =
    localFallbackFor === primaryUrl ? (primaryUrl ? artAfterError(primaryUrl, defId) : null) : primaryUrl;
  const imgFailed = failedSrc != null && failedSrc === imageUrl;

  const chip = COLOR_CHIP[entry.colors[0] ?? ""] ?? "#455a64";
  const pb = powerBreakdown(power, printedPower, entry.power);
  const cb = costBreakdown(fieldCost, entry.cost);
  const counter = useMemo(
    () => (showCounter ? counterValueFor(entry) : null),
    [showCounter, entry],
  );
  const labels = tileStatusLabels(statusLabels, rested);

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

  const hoveredRef = useRef(false);
  useEffect(
    () => () => {
      if (hoveredRef.current) endPreviewHover();
    },
    [],
  );
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;
  const onDoubleRef = useRef(onDoubleActivate);
  onDoubleRef.current = onDoubleActivate;
  const lastClickAtRef = useRef(0);

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
      longPressRef.current?.cancel();
      clickDeferRef.current?.cancel();
      onDragStart?.();
    },
    onDragEnd: (_p, x, y) => onDragEnd?.(x, y),
    onDragCancel,
    idleTouchAction: dragTouchAction,
  });

  const donLayers = donUnderLayers(attachedDonCount ?? 0);

  const className = [
    "card-tile",
    compact ? "compact" : "full",
    selected ? "selected" : "",
    rested ? "rested" : "",
    donLayers.length ? "has-don-under" : "",
    frame === "leader" ? "leader-frame" : "",
    dropHighlight ? "drop-highlight" : "",
    dragEnabled ? "card-draggable" : "",
    dragging ? "card-dragging" : "",
    classNameExtra ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  function handleClick(e: MouseEvent) {
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
      if (onDoubleRef.current) {
        const now = Date.now();
        const double = lastClickAtRef.current > 0 && now - lastClickAtRef.current <= DOUBLE_CLICK_DELAY_MS;
        lastClickAtRef.current = double ? 0 : now;
        if (double) {
          clickDeferRef.current?.cancel();
          onDoubleRef.current();
          return;
        }
      }
      if (instantClick) onClickRef.current?.();
      else clickDeferRef.current?.onClick();
    }
  }

  function handleDoubleClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    clickDeferRef.current?.cancel();
    if (onDoubleRef.current) return;
    setInspectOpen(true);
  }

  function handlePointerDown(e: PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Mouse press-and-hold on a draggable card is the start of a drag, not an inspect.
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
    if (e.pointerType !== "mouse") return;
    hoveredRef.current = true;
    hoverPreviewCard({ defId, ownerSeat, artCopy, instanceId, live }, e.currentTarget);
  }

  function handlePointerLeave(e: PointerEvent) {
    if (e.pointerType !== "mouse") return;
    hoveredRef.current = false;
    endPreviewHover();
  }

  function handlePointerCancel(e: PointerEvent) {
    longPressRef.current?.onPointerCancel(e);
    dragBind.onPointerCancel?.(e);
  }

  function handleImgError() {
    if (localFallbackFor !== primaryUrl && (isTcgplayerCdnUrl(primaryUrl) || isLocalCardsUrl(primaryUrl))) {
      setLocalFallbackFor(primaryUrl);
      return;
    }
    setFailedSrc(imageUrl);
  }

  const canInspect =
    inspectOnClick || inspectGestures || Boolean(onClick) || dragEnabled;
  const interactive = Boolean(onClick || inspectOnClick || dragEnabled || inspectGestures);

  const tileLabel = cardAriaLabel({
    name: entry.name,
    power: pb?.current,
    cost: cb?.current ?? entry.cost,
    rested: Boolean(rested),
    attachedDon: attachedDonCount,
  });

  const body = (
    <>
      {donLayers.length ? (
        // Farthest layer first so the nearest paints on top.
        <span className="don-under" aria-hidden>
          {[...donLayers].reverse().map((l) => (
            <span
              key={`${l.dx}/${l.dy}`}
              className="don-under-layer"
              style={{ "--dx": `${l.dx}%`, "--dy": `${l.dy}%` } as CSSProperties}
            />
          ))}
        </span>
      ) : null}
      {!imgFailed && imageUrl ? (
        <img
          src={imageUrl}
          alt={entry.name}
          onError={handleImgError}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (isPlaceholderArt(imageUrl, img.naturalWidth, img.naturalHeight)) handleImgError();
          }}
          draggable={false}
        />
      ) : (
        <div className="card-fallback" style={{ backgroundColor: chip }}>
          <span className="card-fallback-name">{entry.name}</span>
          <span className="card-fallback-id">{entry.id}</span>
        </div>
      )}
      {revealed ? (
        <span className="hand-revealed-badge" title="Revealed to opponent" aria-label="Revealed to opponent">
          Revealed
        </span>
      ) : null}
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
                  // Narrow tiles show only this, so the stack stays short enough for the status row under it.
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
          aria-label={blocked ? blockedTitle(playCost ?? entry.cost, blocked) : undefined}
          className={`meta${blocked ? " meta-blocked" : ""}${!(cb && cb.delta !== 0) && playCost != null && playCost !== entry.cost ? " meta-cost-modified" : ""}${
            blocked || (cb && cb.delta !== 0) || (playCost != null && playCost !== entry.cost) ? " meta-changed" : ""
          }`}
          title={
            blocked
              ? blockedTitle(playCost ?? entry.cost, blocked)
              : cb && cb.delta !== 0
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
            : handCostCaption(playCost ?? entry.cost, blocked)}
        </div>
      </div>
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
    onPointerLeave: handlePointerLeave,
    onDoubleClick: handleDoubleClick,
    onContextMenu: (e: MouseEvent) => {
      clickDeferRef.current?.cancel();
      inspectOnContextMenu(e, () => setInspectOpen(true));
    },
  };

  if (defId === "HIDDEN") {
    return (
      <div className={`${className} card-tile-hidden`} style={style} role="img" aria-label="Hidden card" {...dropProps}>
        <span className="card-tile-back" aria-hidden />
      </div>
    );
  }

  return (
    <>
      {interactive ? (
        <button
          type="button"
          className={className}
          aria-label={tileLabel}
          onClick={handleClick}
          onClickCapture={dragBind.onClickCapture}
          onKeyDown={(e) => {
            if (canInspect && e.target === e.currentTarget && isInspectKey(e)) {
              e.preventDefault();
              setInspectOpen(true);
            }
          }}
          draggable={false}
          style={style ? { ...style, ...dragBind.style } : dragBind.style}
          {...dropProps}
          {...pointerHandlers}
        >
          {body}
        </button>
      ) : (
        <div className={className} style={style} role="group" aria-label={tileLabel} {...dropProps} {...pointerHandlers}>
          {body}
        </div>
      )}
      <CardInspect
        defId={defId}
        open={inspectOpen}
        onClose={() => setInspectOpen(false)}
        ownerSeat={ownerSeat}
        artCopy={artCopy}
        viewingSeat={viewingSeat}
        live={live}
      />
    </>
  );
}

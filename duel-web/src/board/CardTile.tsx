import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type MouseEvent,
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
  /** Seat that owns this card instance (art resolution). */
  ownerSeat?: Seat;
  /** Seat controlling the UI (alt-art picker writes here). */
  viewingSeat?: Seat;
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
  ownerSeat,
  viewingSeat,
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

  function handleImgError() {
    const primary = resolveCardImageUrl(defId, { ownerSeat, size: "thumb" });
    if (!localFallback && isTcgplayerCdnUrl(primary)) {
      setLocalFallback(true);
      return;
    }
    setImgFailed(true);
  }

  const body = (
    <>
      {!imgFailed && imageUrl ? (
        <img src={imageUrl} alt={entry.name} onError={handleImgError} />
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

  return (
    <>
      {onClick || inspectOnClick ? (
        <button type="button" className={className} onClick={handleClick}>
          {body}
        </button>
      ) : (
        <div className={className}>{body}</div>
      )}
      <CardInspect
        defId={defId}
        open={inspectOpen}
        onClose={() => setInspectOpen(false)}
        ownerSeat={ownerSeat}
        viewingSeat={viewingSeat ?? ownerSeat}
      />
    </>
  );
}

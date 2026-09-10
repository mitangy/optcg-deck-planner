import { useMemo, useState, type MouseEvent } from "react";
import { resolveCardImageUrl } from "../decks/artPrefs";
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
        <button
          type="button"
          className="card-inspect-chip"
          title="Inspect card"
          aria-label={`Inspect ${entry.name}`}
          onClick={openInspect}
        >
          i
        </button>
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
        onClose={() => {
          setInspectOpen(false);
          setArtTick((n) => n + 1);
        }}
      />
    </>
  );
}

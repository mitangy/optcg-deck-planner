import { useMemo, useState } from "react";
import { lookupCard } from "../cards/atlas";

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
  onClick?: () => void;
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
}: Props) {
  const entry = useMemo(() => lookupCard(defId), [defId]);
  const [imgFailed, setImgFailed] = useState(false);
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

  const body = (
    <>
      {!imgFailed && entry.imageUrl ? (
        <img src={entry.imageUrl} alt={entry.name} onError={() => setImgFailed(true)} />
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
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

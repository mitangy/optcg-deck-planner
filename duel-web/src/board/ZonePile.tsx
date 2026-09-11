import { resolveCardImageUrl } from "../decks/artPrefs";
import type { Seat } from "../net/protocol";
import { DON_CARD_ART } from "./donArt";

type Props = {
  label: string;
  count: number;
  variant?: "life" | "deck" | "don" | "trash";
  secret?: boolean;
  /** Optional top-face art (trash top card). */
  topDefId?: string | null;
  ownerSeat?: Seat;
  /** Opens zone browser when set (typically trash). */
  onOpen?: () => void;
};

export function ZonePile({
  label,
  count,
  variant = "deck",
  secret,
  topDefId,
  ownerSeat,
  onOpen,
}: Props) {
  const openable = Boolean(onOpen);
  const topArt =
    variant === "don"
      ? DON_CARD_ART
      : topDefId
        ? resolveCardImageUrl(topDefId, { ownerSeat, size: "thumb" })
        : null;

  const body = (
    <>
      <div className="zone-pile-stack" aria-hidden>
        <span className="zone-pile-face" />
        <span className="zone-pile-face mid" />
        {topArt ? (
          <img className="zone-pile-face top don-pile-art" src={topArt} alt="" />
        ) : (
          <span className="zone-pile-face top" />
        )}
      </div>
      <div className="zone-pile-meta">
        <span className="zone-pile-label">{label}</span>
        <span className="zone-pile-count">{secret ? "??" : count}</span>
      </div>
    </>
  );

  if (openable) {
    return (
      <button
        type="button"
        className={`zone-pile zone-pile-${variant} zone-pile-openable`}
        title={`View ${label} (${count})`}
        aria-label={`View ${label}, ${count} cards`}
        onClick={onOpen}
      >
        {body}
      </button>
    );
  }

  return (
    <div
      className={`zone-pile zone-pile-${variant}${onOpen ? " zone-pile-empty" : ""}`}
      title={`${label}: ${count}`}
    >
      {body}
    </div>
  );
}

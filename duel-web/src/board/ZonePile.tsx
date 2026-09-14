import { resolveCardImageUrl } from "../decks/artPrefs";
import type { Seat } from "../net/protocol";
import { DON_CARD_ART } from "./donArt";

/** Life/deck pile count label — never secret (life used to show "??"). */
export function zonePileCountLabel(count: number, expectedCount?: number): string {
  if (count > 0) return String(count);
  if (expectedCount != null && expectedCount > 0) return `0 / ${expectedCount}`;
  return "0";
}

/** Visible face-down cards in the life fan — one per life, capped at 5. */
export function lifePileFaceCount(count: number): number {
  if (count <= 0) return 0;
  return Math.min(count, 5);
}

type Props = {
  label: string;
  count: number;
  variant?: "life" | "deck" | "don" | "trash";
  /** Leader printed life — shown as a hint when count is still 0 (pre-mulligan). */
  expectedCount?: number;
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
  expectedCount,
  topDefId,
  ownerSeat,
  onOpen,
}: Props) {
  const openable = Boolean(onOpen);
  const countLabel = zonePileCountLabel(count, expectedCount);
  const topArt =
    variant === "don"
      ? DON_CARD_ART
      : topDefId
        ? resolveCardImageUrl(topDefId, { ownerSeat, size: "thumb" })
        : null;

  const stack =
    variant === "life" ? (
      <div className="zone-pile-stack" aria-hidden>
        {Array.from({ length: lifePileFaceCount(count) }, (_, i) => (
          <span key={i} className="zone-pile-face" />
        ))}
      </div>
    ) : (
      <div className="zone-pile-stack" aria-hidden>
        <span className="zone-pile-face" />
        <span className="zone-pile-face mid" />
        {topArt ? (
          <img className="zone-pile-face top don-pile-art" src={topArt} alt="" />
        ) : (
          <span className="zone-pile-face top" />
        )}
      </div>
    );

  const body = (
    <>
      {stack}
      <div className="zone-pile-meta">
        <span className="zone-pile-label">{label}</span>
        <span className="zone-pile-count">{countLabel}</span>
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
      title={`${label}: ${countLabel}`}
    >
      {body}
    </div>
  );
}

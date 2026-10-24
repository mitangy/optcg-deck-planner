import type { CSSProperties } from "react";
import { CardArt } from "../cards/CardArt";
import { artAfterError, isPreviewArtPath } from "@optcg/ui/cardArt";
import { resolveCardImageUrl } from "../decks/artPrefs";
import type { Seat } from "../net/protocol";
import type { LifeFan } from "../settings";
import { inspectOnContextMenu } from "./inspectGestures";
import { endPreviewHover, hoverPreviewCard } from "./cardPreview";

/** Life/deck pile count label — never secret (life used to show "??"). */
export function zonePileCountLabel(count: number, expectedCount?: number): string {
  if (count > 0) return String(count);
  if (expectedCount != null && expectedCount > 0) return `0 / ${expectedCount}`;
  return "0";
}

/** The fan direction drawn on a side: yours follows the setting, the opponent's mirrors it across the midline (#499). */
export function lifeFanForSide(pref: LifeFan, side: "you" | "opp"): LifeFan {
  if (side === "you") return pref;
  return pref === "down" ? "up" : "down";
}

/** Visible face-down cards in the life fan — one per life, capped at 5. */
export function lifePileFaceCount(count: number): number {
  if (count <= 0) return 0;
  return Math.min(count, 5);
}

/**
 * What each drawn Life face shows, in DOM order: `null` for a face-down card,
 * else the face-up card's defId. The last face is drawn in front, so it is the
 * top of Life (index 0); a face-up card deeper than the cap stretches the fan
 * so it still shows.
 */
export function lifePileFaces(
  count: number,
  faceUp: ReadonlyArray<{ index: number; defId: string }> = [],
): Array<string | null> {
  const deepest = faceUp.reduce((m, c) => (c.index < count ? Math.max(m, c.index + 1) : m), 0);
  const n = Math.max(lifePileFaceCount(count), deepest);
  const byIndex = new Map(faceUp.map((c) => [c.index, c.defId]));
  return Array.from({ length: n }, (_, i) => byIndex.get(n - 1 - i) ?? null);
}

/**
 * Stacked faces drawn for a deck / DON!! deck / trash pile: none when empty
 * (the slot outline shows instead), then one per card up to 3.
 */
export function stackPileFaceCount(count: number): number {
  if (count <= 0) return 0;
  return Math.min(count, 3);
}

/**
 * `--life-face-art` for a face-up Life card. A CSS background has no error
 * event, so a card TCGplayer has no art for (EB05) gets its preview scan as a
 * second layer that shows through when the first fails. Cards without preview
 * art get a single layer (no extra request per Life card).
 */
export function lifeFaceArt(defId: string, ownerSeat?: Seat): string {
  const primary = resolveCardImageUrl(defId, { ownerSeat, size: "thumb" });
  if (!primary) return "none";
  const next = artAfterError(primary, defId);
  const layers = [primary];
  if (next && isPreviewArtPath(next)) layers.push(next);
  return layers.map((u) => `url("${u}")`).join(", ");
}

type Props = {
  label: string;
  count: number;
  variant?: "life" | "deck" | "don" | "trash";
  /** Leader printed life — shown as a hint when count is still 0 (pre-mulligan). */
  expectedCount?: number;
  /** Life only: cards lying face up, by Life index (0 = top). */
  faceUp?: ReadonlyArray<{ index: number; defId: string }>;
  /** Optional top-face art (trash top card). */
  topDefId?: string | null;
  ownerSeat?: Seat;
  /** Life only: which way the faces fan (default down). */
  lifeFan?: LifeFan;
  /** Opens zone browser when set (typically trash). */
  onOpen?: () => void;
  /** Right-click (mouse) opens the top card's details instead of the browser menu. */
  onInspectTop?: () => void;
  /** Life only: right-click (mouse) on a face-up Life card opens that card's details. */
  onInspectFace?: (defId: string) => void;
};

export function ZonePile({
  label,
  count,
  variant = "deck",
  expectedCount,
  topDefId,
  faceUp,
  ownerSeat,
  lifeFan = "down",
  onOpen,
  onInspectTop,
  onInspectFace,
}: Props) {
  const openable = Boolean(onOpen);
  const countLabel = zonePileCountLabel(count, expectedCount);
  const faces = stackPileFaceCount(count);
  // Deck / life / DON!! deck are face-down: their faces render the card-back
  // art from CSS (`--card-back-art` / `--don-back-art`). Only trash shows a face.
  const topArt =
    faces > 0 && variant === "trash" && topDefId
      ? resolveCardImageUrl(topDefId, { ownerSeat, size: "thumb" })
      : null;

  const stack =
    variant === "life" ? (
      <div className={`zone-pile-stack${lifeFan === "up" ? " is-fan-up" : ""}`} aria-hidden>
        {lifePileFaces(count, faceUp).map((defId, i) =>
          defId ? (
            <span
              key={i}
              className="zone-pile-face is-face-up"
              data-def-id={defId}
              // Hovering a face-up Life card shows it in the preview, like a field card (#529).
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") hoverPreviewCard({ defId, ownerSeat }, e.currentTarget);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === "mouse") endPreviewHover();
              }}
              onContextMenu={onInspectFace ? (e) => inspectOnContextMenu(e, () => onInspectFace(defId)) : undefined}
              style={{ "--life-face-art": lifeFaceArt(defId, ownerSeat) } as CSSProperties}
            />
          ) : (
            <span key={i} className="zone-pile-face" />
          ),
        )}
      </div>
    ) : faces === 0 ? (
      // Empty pile: dashed slot outline only — never a card face / DON!! art.
      <div className="zone-pile-stack is-empty" aria-hidden>
        <span className="zone-pile-slot" />
      </div>
    ) : (
      <div className="zone-pile-stack" aria-hidden>
        {faces >= 3 ? <span className="zone-pile-face" /> : null}
        {faces >= 2 ? <span className="zone-pile-face mid" /> : null}
        {topArt ? (
          <CardArt
            src={topArt}
            defId={topDefId!}
            className="zone-pile-face top don-pile-art"
            draggable={false}
            fallback={<span className="zone-pile-face top" />}
          />
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
        onContextMenu={onInspectTop ? (e) => inspectOnContextMenu(e, onInspectTop) : undefined}
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

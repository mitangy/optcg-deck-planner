import type { CSSProperties } from "react";
import { CardArt } from "../../cards/CardArt";
import { artAfterError, isPreviewArtPath } from "@optcg/ui/cardArt";
import { resolveCardImageUrl } from "../../decks/artPrefs";
import type { Seat } from "../../net/protocol";
import type { LifeFan } from "../../settings";
import { inspectOnContextMenu } from "../preview/inspectGestures";
import { endPreviewHover, hoverPreviewCard } from "../preview/cardPreview";

export function zonePileCountLabel(count: number, expectedCount?: number): string {
  if (count > 0) return String(count);
  if (expectedCount != null && expectedCount > 0) return `0 / ${expectedCount}`;
  return "0";
}

export function lifeFanForSide(pref: LifeFan, side: "you" | "opp"): LifeFan {
  if (side === "you") return pref;
  return pref === "down" ? "up" : "down";
}

export function lifePileFaceCount(count: number): number {
  if (count <= 0) return 0;
  return Math.min(count, 5);
}

export function lifePileFaces(
  count: number,
  faceUp: ReadonlyArray<{ index: number; defId: string; artCopy?: number }> = [],
): Array<string | null> {
  const deepest = faceUp.reduce((m, c) => (c.index < count ? Math.max(m, c.index + 1) : m), 0);
  const n = Math.max(lifePileFaceCount(count), deepest);
  const byIndex = new Map(faceUp.map((c) => [c.index, c.defId]));
  return Array.from({ length: n }, (_, i) => byIndex.get(n - 1 - i) ?? null);
}

export function stackPileFaceCount(count: number): number {
  if (count <= 0) return 0;
  return Math.min(count, 3);
}

export function lifeFaceArt(defId: string, ownerSeat?: Seat, artCopy?: number): string {
  const primary = resolveCardImageUrl(defId, { ownerSeat, artCopy, size: "thumb" });
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
  expectedCount?: number;
  faceUp?: ReadonlyArray<{ index: number; defId: string; artCopy?: number }>;
  topDefId?: string | null;
  topArtCopy?: number | null;
  ownerSeat?: Seat;
  lifeFan?: LifeFan;
  onOpen?: () => void;
  onInspectTop?: () => void;
  onInspectFace?: (defId: string, artCopy?: number) => void;
};

export function ZonePile({
  label,
  count,
  variant = "deck",
  expectedCount,
  topDefId,
  topArtCopy,
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
  const topArt =
    faces > 0 && variant === "trash" && topDefId
      ? resolveCardImageUrl(topDefId, { ownerSeat, artCopy: topArtCopy ?? undefined, size: "thumb" })
      : null;

  const stack =
    variant === "life" ? (
      <div className={`zone-pile-stack${lifeFan === "up" ? " is-fan-up" : ""}`} aria-hidden>
        {lifePileFaces(count, faceUp).map((defId, i, all) => {
          const artCopy = faceUp?.find((c) => c.index === all.length - 1 - i)?.artCopy;
          return defId ? (
            <span
              key={i}
              className="zone-pile-face is-face-up"
              data-def-id={defId}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") hoverPreviewCard({ defId, ownerSeat, artCopy }, e.currentTarget);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === "mouse") endPreviewHover();
              }}
              onContextMenu={onInspectFace ? (e) => inspectOnContextMenu(e, () => onInspectFace(defId, artCopy)) : undefined}
              style={{ "--life-face-art": lifeFaceArt(defId, ownerSeat, artCopy) } as CSSProperties}
            />
          ) : (
            <span key={i} className="zone-pile-face" />
          );
        })}
      </div>
    ) : faces === 0 ? (
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

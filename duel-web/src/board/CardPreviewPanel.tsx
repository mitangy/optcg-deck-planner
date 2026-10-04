import { useState, type MouseEvent } from "react";
import { lookupCard } from "../cards/atlas";
import { isPlaceholderArt } from "../cards/cardImage";
import { resolveCardImageUrl } from "../decks/artPrefs";
import { usePreviewCard } from "./cardPreview";
import { CardInspect } from "./CardInspect";
import { inspectOnContextMenu } from "./inspectGestures";
import { LiveCardStatus } from "./LiveCardStatus";
import { counterValueFor, formatCounter } from "../cards/counterValue";

/** Large art + ability text for the last hovered card (wide layouts only). */
export function CardPreviewPanel() {
  const preview = usePreviewCard();
  const [failed, setFailed] = useState<string | null>(null);
  const [inspectOpen, setInspectOpen] = useState(false);

  if (!preview) {
    return (
      <aside className="card-preview card-preview-empty" aria-label="Card preview">
        <div className="card-preview-placeholder" aria-hidden />
        <p className="card-preview-hint">Hover a card to read it here.</p>
      </aside>
    );
  }

  const openInspect = (e: MouseEvent) => inspectOnContextMenu(e, () => setInspectOpen(true));
  const entry = lookupCard(preview.defId);
  const src = resolveCardImageUrl(preview.defId, {
    ownerSeat: preview.ownerSeat,
    size: "large",
  });
  const effect = entry.effectText?.trim() ?? "";
  const cv = counterValueFor(entry);
  const stats = [
    entry.type ? entry.type[0]!.toUpperCase() + entry.type.slice(1) : null,
    `Cost ${entry.cost}`,
    entry.power != null ? `${entry.power} power` : null,
    cv && !cv.effectOnly ? `${formatCounter(cv)} counter` : null,
    entry.life != null ? `${entry.life} life` : null,
  ].filter(Boolean);

  return (
    <aside
      className="card-preview"
      aria-label="Card preview"
      aria-live="polite"
    >
      {src && src !== failed ? (
        <img
          className="card-preview-img"
          src={src}
          alt={entry.name}
          onError={() => setFailed(src)}
          onLoad={(e) => {
            if (isPlaceholderArt(src, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)) setFailed(src);
          }}
          onContextMenu={openInspect}
        />
      ) : (
        <div className="card-preview-placeholder" onContextMenu={openInspect}>
          {entry.id}
        </div>
      )}
      <div className="card-preview-meta">
        {preview.caption ? <p className="card-preview-caption">{preview.caption}</p> : null}
        <h2 className="card-preview-name">{entry.name}</h2>
        <p className="card-preview-stats">{stats.join(" · ")}</p>
        {preview.live ? (
          <LiveCardStatus
            live={preview.live}
            atlasPower={entry.power}
            atlasCost={entry.cost}
            className="card-preview-live"
          />
        ) : null}
        {entry.traits?.length ? (
          <p className="card-preview-traits">{entry.traits.join(" / ")}</p>
        ) : null}
        <p className="card-preview-effect">
          {effect && effect !== "—" && effect !== "-" ? effect : "No printed ability."}
        </p>
      </div>
      <CardInspect
        defId={preview.defId}
        open={inspectOpen}
        onClose={() => setInspectOpen(false)}
        ownerSeat={preview.ownerSeat}
        live={preview.live}
      />
    </aside>
  );
}

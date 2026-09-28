import { useState } from "react";
import { lookupCard } from "../cards/atlas";
import { resolveCardImageUrl } from "../decks/artPrefs";
import { usePreviewCard } from "./cardPreview";

/** Large art + ability text for the last hovered card (wide layouts only). */
export function CardPreviewPanel() {
  const preview = usePreviewCard();
  const [failed, setFailed] = useState<string | null>(null);

  if (!preview) {
    return (
      <aside className="card-preview card-preview-empty" aria-label="Card preview">
        <div className="card-preview-placeholder" aria-hidden />
        <p className="card-preview-hint">Hover a card to read it here.</p>
      </aside>
    );
  }

  const entry = lookupCard(preview.defId);
  const src = resolveCardImageUrl(preview.defId, {
    ownerSeat: preview.ownerSeat,
    size: "large",
  });
  const effect = entry.effectText?.trim() ?? "";
  const stats = [
    entry.type ? entry.type[0]!.toUpperCase() + entry.type.slice(1) : null,
    `Cost ${entry.cost}`,
    entry.power != null ? `${entry.power} power` : null,
    entry.counter != null ? `+${entry.counter} counter` : null,
    entry.life != null ? `${entry.life} life` : null,
  ].filter(Boolean);

  return (
    <aside className="card-preview" aria-label="Card preview" aria-live="polite">
      {src && src !== failed ? (
        <img
          className="card-preview-img"
          src={src}
          alt={entry.name}
          onError={() => setFailed(src)}
        />
      ) : (
        <div className="card-preview-placeholder">{entry.id}</div>
      )}
      <div className="card-preview-meta">
        <h2 className="card-preview-name">{entry.name}</h2>
        <p className="card-preview-stats">{stats.join(" · ")}</p>
        {entry.traits?.length ? (
          <p className="card-preview-traits">{entry.traits.join(" / ")}</p>
        ) : null}
        <p className="card-preview-effect">
          {effect && effect !== "—" && effect !== "-" ? effect : "No printed ability."}
        </p>
      </div>
    </aside>
  );
}

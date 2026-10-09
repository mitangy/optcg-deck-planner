import { useRef, useState, type MouseEvent } from "react";
import { lookupCard } from "../cards/atlas";
import { isPlaceholderArt } from "../cards/cardImage";
import { resolveCardImageUrl } from "../decks/artPrefs";
import { usePreviewCard } from "./cardPreview";
import { CardInspect } from "./CardInspect";
import { inspectOnContextMenu } from "./inspectGestures";
import { useMoreBelow } from "./scrollCue";
import { LiveCardStatus } from "./LiveCardStatus";
import { useDuelSettings } from "../settings";
import { parsePreviewText } from "./previewText";
import { PreviewBadges } from "./PreviewBadges";

/** Effect text with its [On Play] / [Counter] / [DON!! x1] tags drawn as chips. */
function EffectText({ text }: { text: string }) {
  return (
    <>
      {parsePreviewText(text).map((seg, i) =>
        seg.type === "chip" ? (
          <span key={i} className={`kw-chip kw-${seg.kind}`}>
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

/** Large art + ability text for the last hovered card (wide layouts only). */
export function CardPreviewPanel() {
  const preview = usePreviewCard();
  const big = useDuelSettings().previewBigCard;
  const [failed, setFailed] = useState<string | null>(null);
  const [inspectOpen, setInspectOpen] = useState(false);
  const metaRef = useRef<HTMLDivElement | null>(null);
  const scrollCue = useMoreBelow(metaRef, [preview?.defId, preview?.caption, preview?.live]);

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
  const art =
    src && src !== failed ? (
      <img
        className="card-preview-img"
        src={src}
        alt={entry.name}
        draggable={false}
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
    );
  const effect = entry.effectText?.trim() ?? "";
  return (
    <aside
      className={`card-preview ${big ? "card-preview-big" : "card-preview-compact"}`}
      aria-label="Card preview"
      aria-live="polite"
    >
      {big ? (
        <div className="card-preview-stage">
          {art}
          {preview.caption ? <p className="card-preview-caption card-preview-caption-big">{preview.caption}</p> : null}
        </div>
      ) : (
        <>
          <div className="card-preview-head">
            {art}
            <div className="card-preview-headtext">
              {preview.caption ? <p className="card-preview-caption">{preview.caption}</p> : null}
              <h2 className="card-preview-name">{entry.name}</h2>
              {entry.traits?.length ? (
                <p className="card-preview-traits">{entry.traits.join(" / ")}</p>
              ) : null}
            </div>
          </div>
          <PreviewBadges entry={entry} />
          <div
            className={`card-preview-meta${scrollCue.more ? " has-more" : ""}`}
            ref={metaRef}
            onScroll={scrollCue.onScroll}
          >
            {preview.live ? (
              <LiveCardStatus
                live={preview.live}
                atlasPower={entry.power}
                atlasCost={entry.cost}
                className="card-preview-live"
              />
            ) : null}
            <p className="card-preview-effect">
              {effect && effect !== "—" && effect !== "-" ? <EffectText text={effect} /> : "No printed ability."}
            </p>
          </div>
        </>
      )}
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

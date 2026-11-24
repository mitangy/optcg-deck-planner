import { resolveCardImageUrl } from "../../decks/artPrefs";
import { useArtFallback } from "../../cards/useArtFallback";
import { colorFill } from "../../board/preview/PreviewBadges";

export function LeaderTile({
  id,
  name,
  colors,
  selected,
  onPick,
}: {
  id: string;
  name: string;
  colors: readonly string[];
  selected: boolean;
  onPick: () => void;
}) {
  const { src, fail } = useArtFallback(resolveCardImageUrl(id, { deck: null, size: "thumb" }), id);
  return (
    <li>
      <button
        type="button"
        className={`nd-tile${selected ? " is-selected" : ""}`}
        aria-pressed={selected}
        aria-label={`${name} (${id})`}
        onClick={onPick}
      >
        <span className="nd-tile-art">
          {src ? <img src={src} alt="" loading="lazy" decoding="async" onError={fail} /> : <span className="nd-tile-fallback">{id}</span>}
          <span className="nd-tile-colors" aria-hidden>
            {colors.map((c) => (
              <i key={c} style={{ background: colorFill([c]) }} />
            ))}
          </span>
        </span>
        <span className="nd-tile-name">{name}</span>
      </button>
    </li>
  );
}

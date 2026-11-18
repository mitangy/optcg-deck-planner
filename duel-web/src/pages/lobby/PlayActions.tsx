import { prefetchBoard } from "../../lazyRoutes";
import type { LastMode } from "../../home/lastMode";
import type { PrimaryAction } from "../../home/primaryAction";
import { MODE_CARDS } from "./modes";

export function PlayActions({ primary, disabled, onPrimary, onPlay }: { primary: PrimaryAction; disabled: boolean; onPrimary: () => void; onPlay: (mode: LastMode | "spectate") => void }) {
  return (
    <div className="home-actions">
      <button
        type="button"
        className="btn btn-play"
        disabled={disabled}
        aria-describedby="play-subline"
        onPointerEnter={prefetchBoard}
        onFocus={prefetchBoard}
        onClick={onPrimary}
      >
        {primary.title}
        <span id="play-subline" className="btn-play-sub" aria-hidden>
          {primary.subline}
        </span>
      </button>
      <div className="mode-tiles mode-tiles-5">
        {MODE_CARDS.map((card) => (
          <button
            key={card.mode}
            type="button"
            className="mode-tile"
            aria-current={card.mode === primary.mode ? "true" : undefined}
            disabled={disabled}
            onPointerEnter={prefetchBoard}
            onFocus={prefetchBoard}
            onClick={() => onPlay(card.mode)}
          >
            <span className="mode-tile-title">{card.title}</span>
            <span className="mode-tile-blurb">{card.short}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

import { prefetchBoard } from "../../lazyRoutes";
import { modeTiles, primaryAction } from "../../home/primaryAction";
import type { LastMode } from "../../home/lastMode";
import { MODE_CARDS } from "./modes";

/** The big Play button (repeats the last mode) and the mode tiles under it. */
export function PlayActions({ lastMode, disabled, onPlay }: { lastMode: LastMode | null; disabled: boolean; onPlay: (at: LastMode | null) => void }) {
  return (
    <div className="home-actions">
      <button
        type="button"
        className="btn btn-play"
        disabled={disabled}
        aria-describedby="play-subline"
        onPointerEnter={prefetchBoard}
        onFocus={prefetchBoard}
        onClick={() => onPlay(lastMode)}
      >
        Play
        <span id="play-subline" className="btn-play-sub" aria-hidden>
          {primaryAction(lastMode).subline}
        </span>
      </button>
      <div className={`mode-tiles mode-tiles-${modeTiles(lastMode).length}`}>
        {modeTiles(lastMode).map((m) => {
          const card = MODE_CARDS.find((c) => c.mode === m)!;
          return (
            <button
              key={m}
              type="button"
              className="mode-tile"
              disabled={disabled}
              onPointerEnter={prefetchBoard}
              onFocus={prefetchBoard}
              onClick={() => onPlay(m)}
            >
              <span className="mode-tile-title">{card.title}</span>
              <span className="mode-tile-blurb">{card.short}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { Menu, MenuButton, MenuItem, MenuList } from "@optcg/ui/popups";
import { prefetchBoard } from "../../lazyRoutes";
import { MORE_MODES, type PlayMode } from "./modes";

export type HomeMode = Exclude<PlayMode, "join">;

/** One gold button for the common case; everything else is a step away, so a first visit has one obvious thing to press. */
export function PlayActions({ disabled, onPlay }: { disabled: boolean; onPlay: (mode: HomeMode) => void }) {
  return (
    <div className="home-actions">
      <button
        type="button"
        className="btn btn-play"
        disabled={disabled}
        aria-describedby="play-subline"
        onPointerEnter={prefetchBoard}
        onFocus={prefetchBoard}
        onClick={() => onPlay("casual")}
      >
        Play now
        <span id="play-subline" className="btn-play-sub" aria-hidden>
          Casual game against another player
        </span>
      </button>
      <div className="mode-tiles mode-tiles-2">
        <button
          type="button"
          className="mode-tile"
          disabled={disabled}
          onPointerEnter={prefetchBoard}
          onFocus={prefetchBoard}
          onClick={() => onPlay("create")}
        >
          <span className="mode-tile-title">Play a friend</span>
          <span className="mode-tile-blurb">Share a room link</span>
        </button>
        <Menu>
          <MenuButton type="button" className="mode-tile mode-more" disabled={disabled}>
            <span className="mode-tile-title">More ways to play</span>
            <span className="mode-tile-blurb">Ranked, bot, practice</span>
          </MenuButton>
          {/* Floats over the page (not in the flow), so opening it never moves the buttons around it. */}
          <MenuList anchor={{ to: "bottom end", gap: 6, padding: 8 }} className="more-menu">
            {MORE_MODES.map((m) => (
              <MenuItem key={m.mode}>
                <button type="button" className="more-item" onPointerEnter={prefetchBoard} onClick={() => onPlay(m.mode)}>
                  <span className="more-item-title">{m.title}</span>
                  <span className="more-item-blurb">{m.short}</span>
                </button>
              </MenuItem>
            ))}
          </MenuList>
        </Menu>
      </div>
    </div>
  );
}

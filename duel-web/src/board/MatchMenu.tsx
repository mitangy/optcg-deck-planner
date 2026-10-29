import { useEffect, useRef } from "react";
import { Menu, MenuButton, MenuItem, MenuList } from "@optcg/ui/popups";
import { ConfirmButton } from "./ConfirmButton";
import { useClickCopy } from "./clickCopy";
import { spectateUrl } from "./clipboard";
import { useCopyFlash } from "./RoomShare";
import type { MatchMenuItemId } from "./matchMenuItems";

type Props = {
  items: MatchMenuItemId[];
  info: { matchup: string | null; seat: string | null; order: string };
  roomId: string | null;
  isFullscreen: boolean;
  leaveLabel?: string;
  onSettings: () => void;
  onToggleFullscreen: () => void;
  /** Defaults to a full page reload; the saved match resumes on boot. */
  onReload?: () => void;
  onReport: () => void;
  onReportPlayer?: () => void;
  onConcede: () => void;
  onLeave: () => void;
  /**
   * "left": opens beside the landscape icon rail instead of under the top bar.
   * "top" / "anchor": opens right under the button wherever it sits (the phone bar, or the
   * side-column row when Bigger playing area hides the top bar), kept on screen.
   */
  placement?: "top" | "left" | "anchor";
};

/** Where the list sits against its button. Headless UI flips and shifts it to stay inside the window. */
const ANCHORS = {
  top: { to: "bottom end", gap: 4, padding: 8 },
  anchor: { to: "bottom end", gap: 6, padding: 8 },
  left: { to: "right start", gap: 1, padding: 4 },
} as const;

/**
 * Phone HUD "⋯" menu: everything that no longer fits the one-row bar. A
 * Headless UI Menu: the list floats in a portal, so opening it never moves the
 * bar or the board; arrow keys, Escape (focus back on the button) and outside
 * click come with it.
 */
export function MatchMenu({
  items,
  info,
  roomId,
  isFullscreen,
  leaveLabel = "Leave match",
  onSettings,
  onToggleFullscreen,
  onReload = () => window.location.reload(),
  onReport,
  onReportPlayer,
  onConcede,
  onLeave,
  placement = "top",
}: Props) {
  const tapCopy = useClickCopy();
  const closeTimer = useRef<number | null>(null);
  const { copied, copy } = useCopyFlash();

  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  return (
    <Menu>
      {({ close }) => (
        <>
          <MenuButton
            type="button"
            className="hud-undo-btn hud-icon-btn hud-menu-btn"
            aria-label="Match menu"
          >
            ⋯
          </MenuButton>
          <MenuList anchor={ANCHORS[placement]} className="match-menu">
            <div className="match-menu-info">
              {info.matchup ? <strong>{info.matchup}</strong> : null}
              <span>
                {info.seat ? `${info.seat} · ` : ""}{info.order}
              </span>
            </div>
            {items.map((id) => {
              switch (id) {
                case "copy-room":
                  return (
                    // Stays open just long enough to show "Copied".
                    <MenuItem key={id} keepOpen disabled={!roomId}>
                      <button
                        type="button"
                        className="match-menu-item"
                        onClick={() => {
                          if (!roomId) return;
                          void copy(roomId, "id");
                          closeTimer.current = window.setTimeout(close, 700);
                        }}
                      >
                        {copied === "id"
                          ? "Copied"
                          : copied === "failed"
                            ? "Copy failed"
                            : `Copy room ID${roomId ? ` (${roomId})` : ""}`}
                      </button>
                    </MenuItem>
                  );
                case "copy-spectate":
                  return (
                    <MenuItem key={id} keepOpen disabled={!roomId}>
                      <button
                        type="button"
                        className="match-menu-item"
                        onClick={() => {
                          if (!roomId) return;
                          void copy(spectateUrl(roomId), "link");
                          closeTimer.current = window.setTimeout(close, 700);
                        }}
                      >
                        {copied === "link"
                          ? "Copied"
                          : copied === "failed"
                            ? "Copy failed"
                            : "Copy spectate link"}
                      </button>
                    </MenuItem>
                  );
                case "settings":
                  return (
                    <MenuItem key={id}>
                      <button type="button" className="match-menu-item" onClick={onSettings}>
                        Gameplay settings
                      </button>
                    </MenuItem>
                  );
                case "fullscreen":
                  return (
                    <MenuItem key={id}>
                      <button
                        type="button"
                        className="match-menu-item"
                        aria-pressed={isFullscreen}
                        onClick={onToggleFullscreen}
                      >
                        {isFullscreen ? "Exit full screen" : "Full screen"}
                      </button>
                    </MenuItem>
                  );
                case "reload":
                  return (
                    <MenuItem key={id}>
                      <button
                        type="button"
                        className="match-menu-item"
                        title="Reload the page and rejoin this match"
                        onClick={onReload}
                      >
                        Reload game
                      </button>
                    </MenuItem>
                  );
                case "report-player":
                  return (
                    <MenuItem key={id}>
                      <button
                        type="button"
                        className="match-menu-item"
                        title="Report this player to the moderators"
                        onClick={onReportPlayer}
                      >
                        Report player
                      </button>
                    </MenuItem>
                  );
                case "report":
                  return (
                    <MenuItem key={id}>
                      <button
                        type="button"
                        className="match-menu-item"
                        title="Tell us what went wrong, without leaving the match"
                        onClick={onReport}
                      >
                        Report a problem
                      </button>
                    </MenuItem>
                  );
                case "concede":
                  // Two steps: the first press arms it and the menu stays open (also for Enter / Space).
                  return (
                    <MenuItem key={id} keepOpen>
                      <ConfirmButton
                        className="match-menu-item match-menu-danger"
                        label="Concede"
                        confirmLabel={tapCopy("Tap again to concede")}
                        reserveWidth
                        title="Forfeit this match"
                        onConfirm={() => {
                          close();
                          onConcede();
                        }}
                      />
                    </MenuItem>
                  );
                case "leave":
                  return (
                    <MenuItem key={id}>
                      <button type="button" className="match-menu-item" onClick={onLeave}>
                        {leaveLabel}
                      </button>
                    </MenuItem>
                  );
              }
            })}
          </MenuList>
        </>
      )}
    </Menu>
  );
}

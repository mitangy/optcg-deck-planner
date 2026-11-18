import { useEffect, useRef } from "react";
import { Menu, MenuButton, MenuItem, MenuList } from "@optcg/ui/popups";
import { ConfirmButton } from "../prompts/ConfirmButton";
import { useClickCopy } from "../input/clickCopy";
import { spectateUrl } from "../input/clipboard";
import { useCopyFlash } from "./RoomShare";
import { HideArtItems, type ArtToggle } from "../prompts/HideArtItems";
import type { MatchMenuItemId } from "./matchMenuItems";

type Props = {
  items: MatchMenuItemId[];
  info: { matchup: string | null; seat: string | null; order: string };
  roomId: string | null;
  isFullscreen: boolean;
  tabMute: { silenced: boolean; label: string; title: string; onToggle: () => void };
  leaveLabel?: string;
  onSettings: () => void;
  onToggleFullscreen: () => void;
  onReload?: () => void;
  onReport: () => void;
  onReportPlayer?: () => void;
  artToggles?: ArtToggle[];
  onToggleArt?: (seat: import("../../net/protocol").Seat) => void;
  onConcede: () => void;
  onLeave: () => void;
  placement?: "top" | "left" | "anchor";
};

const ANCHORS = {
  top: { to: "bottom end", gap: 4, padding: 8 },
  anchor: { to: "bottom end", gap: 6, padding: 8 },
  left: { to: "right start", gap: 1, padding: 4 },
} as const;

export function MatchMenu({
  items,
  info,
  roomId,
  isFullscreen,
  tabMute,
  leaveLabel = "Leave match",
  onSettings,
  onToggleFullscreen,
  onReload = () => window.location.reload(),
  onReport,
  onReportPlayer,
  artToggles = [],
  onToggleArt = () => {},
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
                case "mute-tab":
                  return (
                    <MenuItem key={id}>
                      <button
                        type="button"
                        className="match-menu-item"
                        aria-pressed={tabMute.silenced}
                        title={tabMute.title}
                        onClick={tabMute.onToggle}
                      >
                        {tabMute.label}
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
                case "hide-art":
                  return <HideArtItems key={id} toggles={artToggles} onToggle={onToggleArt} />;
                case "concede":
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

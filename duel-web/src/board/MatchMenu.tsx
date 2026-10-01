import { useEffect, useRef, useState } from "react";
import { ConfirmButton } from "./ConfirmButton";
import { useCopyFlash } from "./RoomShare";
import type { MatchMenuItemId } from "./matchMenuItems";

type Props = {
  items: MatchMenuItemId[];
  info: { matchup: string | null; seat: string; order: string };
  roomId: string | null;
  isFullscreen: boolean;
  leaveLabel?: string;
  onSettings: () => void;
  onToggleFullscreen: () => void;
  /** Defaults to a full page reload; the saved match resumes on boot. */
  onReload?: () => void;
  onConcede: () => void;
  onLeave: () => void;
  /** "left": opens beside the landscape icon rail instead of under the top bar. */
  placement?: "top" | "left";
};

/**
 * Phone HUD "⋯" menu: everything that no longer fits the one-row bar. The
 * panel is a fixed overlay, so opening it never moves the bar or the board.
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
  onConcede,
  onLeave,
  placement = "top",
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const wasOpen = useRef(false);
  const closeTimer = useRef<number | null>(null);
  const { copied, copy } = useCopyFlash();

  useEffect(() => {
    if (open) {
      panelRef.current?.querySelector<HTMLElement>("[data-menu-item]")?.focus();
    } else if (wasOpen.current) {
      triggerRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const choose = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="hud-undo-btn hud-icon-btn hud-menu-btn"
        aria-label="Match menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ⋯
      </button>
      {open ? (
        <>
          <div className="match-menu-backdrop" onPointerDown={() => setOpen(false)} />
          <div ref={panelRef} className={`match-menu${placement === "left" ? " match-menu-left" : ""}`} role="menu" aria-label="Match menu">
            <div className="match-menu-info">
              {info.matchup ? <strong>{info.matchup}</strong> : null}
              <span>
                {info.seat} · {info.order}
              </span>
            </div>
            {items.map((id) => {
              switch (id) {
                case "copy-room":
                  return (
                    <button
                      key={id}
                      type="button"
                      role="menuitem"
                      data-menu-item
                      className="match-menu-item"
                      disabled={!roomId}
                      onClick={() => {
                        if (!roomId) return;
                        void copy(roomId, "id");
                        // Stay just long enough to show "Copied".
                        closeTimer.current = window.setTimeout(() => setOpen(false), 700);
                      }}
                    >
                      {copied === "id"
                        ? "Copied"
                        : copied === "failed"
                          ? "Copy failed"
                          : `Copy room ID${roomId ? ` (${roomId})` : ""}`}
                    </button>
                  );
                case "settings":
                  return (
                    <button
                      key={id}
                      type="button"
                      role="menuitem"
                      data-menu-item
                      className="match-menu-item"
                      onClick={choose(onSettings)}
                    >
                      Gameplay settings
                    </button>
                  );
                case "fullscreen":
                  return (
                    <button
                      key={id}
                      type="button"
                      role="menuitem"
                      data-menu-item
                      className="match-menu-item"
                      aria-pressed={isFullscreen}
                      onClick={choose(onToggleFullscreen)}
                    >
                      {isFullscreen ? "Exit full screen" : "Full screen"}
                    </button>
                  );
                case "reload":
                  return (
                    <button
                      key={id}
                      type="button"
                      role="menuitem"
                      data-menu-item
                      className="match-menu-item"
                      title="Reload the page and rejoin this match"
                      onClick={choose(onReload)}
                    >
                      Reload game
                    </button>
                  );
                case "concede":
                  return (
                    <ConfirmButton
                      key={id}
                      className="match-menu-item match-menu-danger"
                      label="Concede"
                      confirmLabel="Tap again to concede"
                      reserveWidth
                      title="Forfeit this match"
                      onConfirm={choose(onConcede)}
                    />
                  );
                case "leave":
                  return (
                    <button
                      key={id}
                      type="button"
                      role="menuitem"
                      data-menu-item
                      className="match-menu-item"
                      onClick={choose(onLeave)}
                    >
                      {leaveLabel}
                    </button>
                  );
              }
            })}
          </div>
        </>
      ) : null}
    </>
  );
}

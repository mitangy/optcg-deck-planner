import { useEffect, type ReactNode } from "react";
import { CopilotGlyph } from "../copilot/LogPoseMatchButton";

export type LandscapePanel = "log" | "chat" | "brief";

const LABEL: Record<LandscapePanel, string> = { log: "Battle log", chat: "Chat", brief: "Log Pose" };

function Icon({ panel }: { panel: LandscapePanel }) {
  if (panel === "brief") {
    return (
      <CopilotGlyph size={20} />
    );
  }
  return panel === "log" ? (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <path d="M4 5h12M4 10h12M4 15h8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <path
        d="M3.5 4.5h13v8h-6l-3.5 3v-3h-3.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type RailProps = {
  open: LandscapePanel | null;
  onToggle: (panel: LandscapePanel) => void;
  hasChat: boolean;
  /** Log Pose is on for this match (the brief, the copilot or both): one button, whichever it is. */
  hasBrief?: boolean;
  /** The brief is being written or the copilot is running: the Log Pose button shows its busy dot. */
  briefBusy?: boolean;
  logCount: number;
  /** The ⋯ match menu button (there is no top bar in landscape). */
  menu: ReactNode;
};

/**
 * Landscape phones: the left column shrinks to an icon rail so the board gets
 * the width. The log and chat open as overlays (see LandscapeOverlay).
 */
export function LandscapeRail({ open, onToggle, hasChat, hasBrief = false, briefBusy = false, logCount, menu }: RailProps) {
  const panels: LandscapePanel[] = [...(hasChat ? (["log", "chat"] as const) : (["log"] as const)), ...(hasBrief ? (["brief"] as const) : [])];
  return (
    <nav className="lp-rail" aria-label="Board panels">
      {menu}
      {panels.map((panel) => (
        <button
          key={panel}
          type="button"
          className={`lp-rail-btn${open === panel ? " active" : ""}`}
          aria-label={LABEL[panel]}
          aria-expanded={open === panel}
          title={LABEL[panel]}
          data-busy={panel === "brief" && briefBusy ? "true" : undefined}
          onClick={() => onToggle(panel)}
        >
          <Icon panel={panel} />
          {panel === "log" && logCount > 0 ? (
            <span className="lp-rail-badge" aria-hidden>
              {logCount > 99 ? "99+" : logCount}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}

/** Fixed panel beside the rail; outside taps and Escape close it, the board never shifts. */
export function LandscapeOverlay({
  panel,
  onClose,
  backdrop = true,
  children,
}: {
  panel: LandscapePanel;
  onClose: () => void;
  /** Outside taps close the panel (default). Off: the board stays tappable underneath. */
  backdrop?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      {backdrop ? <div className="lp-overlay-backdrop" onPointerDown={onClose} /> : null}
      <div className={`lp-overlay lp-overlay-${panel}`} role="region" aria-label={LABEL[panel]}>
        {children}
      </div>
    </>
  );
}

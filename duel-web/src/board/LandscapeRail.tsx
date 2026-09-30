import { useEffect, type ReactNode } from "react";

export type LandscapePanel = "log" | "chat";

const LABEL: Record<LandscapePanel, string> = { log: "Battle log", chat: "Chat" };

function Icon({ panel }: { panel: LandscapePanel }) {
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
  logCount: number;
  /** The ⋯ match menu button (there is no top bar in landscape). */
  menu: ReactNode;
};

/**
 * Landscape phones: the left column shrinks to an icon rail so the board gets
 * the width. The log and chat open as overlays (see LandscapeOverlay).
 */
export function LandscapeRail({ open, onToggle, hasChat, logCount, menu }: RailProps) {
  const panels: LandscapePanel[] = hasChat ? ["log", "chat"] : ["log"];
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
  children,
}: {
  panel: LandscapePanel;
  onClose: () => void;
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
      <div className="lp-overlay-backdrop" onPointerDown={onClose} />
      <div className={`lp-overlay lp-overlay-${panel}`} role="region" aria-label={LABEL[panel]}>
        {children}
      </div>
    </>
  );
}

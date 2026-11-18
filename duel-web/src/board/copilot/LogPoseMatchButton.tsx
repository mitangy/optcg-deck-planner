import { useLogPose } from "@optcg/analyst-client";

export function CopilotGlyph({ size = 18, className = "hud-brief-icon" }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M4.5 3h11A1.5 1.5 0 0 1 17 4.5v8a1.5 1.5 0 0 1-1.5 1.5H9.2L5.6 16.8a.5.5 0 0 1-.8-.4V14h-.3A1.5 1.5 0 0 1 3 12.5v-8A1.5 1.5 0 0 1 4.5 3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M10 5.6l1.7 3.9L10 11.9 8.3 9.5z" fill="currentColor" />
    </svg>
  );
}

export function LogPoseMatchButton({ layout, over, busy }: { layout: "desktop" | "portrait" | "landscape"; over: boolean; busy: boolean }) {
  const { panelOpen, openPanel, closePanel } = useLogPose();
  if (layout === "landscape") return null;
  return (
    <button
      type="button"
      className={`hud-brief-btn hud-copilot-btn${layout === "desktop" ? " hud-brief-text" : " hud-icon-btn"}`}
      aria-label="Log Pose"
      aria-expanded={panelOpen}
      title="Log Pose: matchup brief and chat for this game"
      data-busy={busy ? "true" : undefined}
      style={over ? { visibility: "hidden" } : undefined}
      tabIndex={over ? -1 : undefined}
      aria-hidden={over ? true : undefined}
      onClick={() => (panelOpen ? closePanel() : openPanel())}
    >
      <CopilotGlyph />
      {layout === "desktop" ? <span className="hud-brief-label">Log Pose</span> : null}
      <span className="hud-brief-dot" aria-hidden="true" />
    </button>
  );
}

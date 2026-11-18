import type { ReactElement } from "react";

// Drawn like the count icons on the board (16 grid, currentColor, round 1.3 strokes) so the toolbar reads the same on every platform; emoji and glyphs change shape per font.
export type HudIconKind = "fullscreen" | "fullscreen-exit" | "sound" | "muted" | "settings" | "flag" | "warning";

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function paths(kind: HudIconKind): ReactElement {
  switch (kind) {
    case "fullscreen":
      return <path {...STROKE} d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />;
    case "fullscreen-exit":
      return <path {...STROKE} d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5" />;
    case "sound":
      return (
        <>
          <path d="M2 6h2.4L8 3v10L4.4 10H2z" fill="currentColor" />
          <path {...STROKE} d="M10.4 5.6a3.4 3.4 0 0 1 0 4.8M12.2 3.8a6 6 0 0 1 0 8.4" />
        </>
      );
    case "muted":
      return (
        <>
          <path d="M2 6h2.4L8 3v10L4.4 10H2z" fill="currentColor" />
          <path {...STROKE} d="m10.5 6 4 4M14.5 6l-4 4" />
        </>
      );
    case "settings":
      return (
        <>
          <circle {...STROKE} cx="8" cy="8" r="2.2" />
          <path {...STROKE} d="M8 1.8v1.9M8 12.3v1.9M1.8 8h1.9M12.3 8h1.9M3.6 3.6l1.3 1.3M11.1 11.1l1.3 1.3M12.4 3.6l-1.3 1.3M4.9 11.1l-1.3 1.3" />
        </>
      );
    case "flag":
      return <path {...STROKE} d="M3.5 14V2.5M3.5 3h8.5l-1.8 2.8L12 8.6H3.5" />;
    case "warning":
      return (
        <>
          <path {...STROKE} d="M8 2.2 14.2 13H1.8z" />
          <path {...STROKE} d="M8 6.4v3.2M8 11.3v.1" />
        </>
      );
  }
}

export function HudIcon({ kind, className = "hud-icon" }: { kind: HudIconKind; className?: string }) {
  return (
    <svg className={className} width="1.1em" height="1.1em" viewBox="0 0 16 16" aria-hidden focusable="false">
      {paths(kind)}
    </svg>
  );
}

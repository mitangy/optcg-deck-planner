import type { StatusGlyph, StatusIconSpec } from "./statusIcons";

/** 24x24 line icons; stroke/fill use currentColor so the tone class colours them. */
function Glyph({ glyph }: { glyph: StatusGlyph }) {
  switch (glyph) {
    case "negated":
      return (
        <>
          <circle cx="12" cy="12" r="7.5" />
          <path d="M6.7 17.3 17.3 6.7" />
        </>
      );
    case "no-attack":
      return (
        <>
          <path d="M5 19 17 7M14 5l5 5M5 19l2-2" />
          <path d="M19 19 7 7M10 5 5 10M19 19l-2-2" />
        </>
      );
    case "sleep":
      return <path d="M5 8h8l-8 10h8M15 3h4.5L15 9h4.5" />;
    case "shield":
      return <path d="M12 3.5 19 6v5.5c0 4.4-2.9 7.2-7 9-4.1-1.8-7-4.6-7-9V6z" />;
    case "unblockable":
      return (
        <>
          <path d="M12 3.5 19 6v5.5c0 4.4-2.9 7.2-7 9-4.1-1.8-7-4.6-7-9V6z" />
          <path d="M5 4 19 20" />
        </>
      );
    case "bolt":
      return <path className="fill" d="M13.5 2 5 13.5h6L10 22l9-12h-6z" />;
    case "bolt-character":
      return (
        <>
          <path className="fill" d="M11 2 3.5 12.5H9L8 20l7-9.5h-5.5z" />
          <path d="M20.5 15.5A3.2 3.2 0 1 0 20.5 21" />
        </>
      );
    case "double":
      return <path d="M4 8l6 8M10 8l-6 8M14 10.5c0-2 6-2 6 0 0 3-6 3.5-6 6.5h6" />;
    case "banish":
      return <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />;
    case "no-refresh":
      return (
        <>
          <path d="M19 12a7 7 0 1 1-2.2-5.1M19 4v4.5h-4.5" />
          <path d="M4.5 4.5 19.5 19.5" />
        </>
      );
    case "star":
      return <path className="fill" d="M12 2.5 14.2 9.8 21.5 12 14.2 14.2 12 21.5 9.8 14.2 2.5 12 9.8 9.8z" />;
    case "lock":
      return (
        <>
          <rect x="6.5" y="11" width="11" height="9" rx="2" />
          <path d="M9 11V8a3 3 0 0 1 6 0v3" />
        </>
      );
  }
}

/** Fixed-size square badge for one status label; the full label is the tooltip / accessible name. */
export function StatusIcon({ label, spec }: { label: string; spec: StatusIconSpec }) {
  return (
    <span
      role="img"
      className={`status-icon status-icon-${spec.tone}`}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 24 24" aria-hidden focusable="false">
        <Glyph glyph={spec.glyph} />
      </svg>
    </span>
  );
}

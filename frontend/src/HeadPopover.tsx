import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Compact page-head action that opens a fixed-position panel under its
 * trigger. Fixed (not in-flow) so opening it never shifts the header or the
 * list below — see CLAUDE.md "No layout shift on expand/toggle".
 */
export function HeadPopover({
  label,
  badge,
  icon,
  className = "btn secondary",
  panelLabel,
  width = 320,
  children,
}: {
  label: ReactNode;
  /** Small status text inside the trigger, e.g. "On". */
  badge?: string;
  /** Decorative glyph shown instead of the text label on very narrow screens (the label stays as the accessible name). */
  icon?: ReactNode;
  className?: string;
  /** Accessible name for the dialog panel. */
  panelLabel: string;
  width?: number;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    function place() {
      const btn = btnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const w = Math.min(width, window.innerWidth - 16);
      // Right-align to the trigger, then clamp inside the viewport.
      const left = Math.min(Math.max(8, rect.right - w), window.innerWidth - w - 8);
      setPos({ top: rect.bottom + 6, left, width: w });
    }
    place();
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    }
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, width]);

  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className={`head-popover${open ? " open" : ""}`}>
      <button
        ref={btnRef}
        type="button"
        className={`${className} head-popover-btn`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={typeof label === "string" ? label : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {icon ? (
          <span className="head-popover-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className="head-popover-label">{label}</span>
        {badge ? <span className="head-popover-badge">{badge}</span> : null}
        <span className="head-popover-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && pos && (
        <div
          id={panelId}
          role="dialog"
          aria-label={panelLabel}
          className="head-popover-panel"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}

export function ShareIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13V3M6.5 6.5 10 3l3.5 3.5M4.5 10v6h11v-6" />
    </svg>
  );
}

export function MoreIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor">
      <circle cx="4.5" cy="10" r="1.6" />
      <circle cx="10" cy="10" r="1.6" />
      <circle cx="15.5" cy="10" r="1.6" />
    </svg>
  );
}

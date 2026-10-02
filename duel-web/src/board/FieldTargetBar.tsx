import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import "./fieldBar.css";

/**
 * Desktop: centre of the strip between the two mats, so the bar sits in the
 * gap instead of over either side's cards. Undefined on phones, portrait or
 * landscape (the bar docks over the hand there), or before layout.
 */
function useMidlineAnchor(): CSSProperties | undefined {
  const [anchor, setAnchor] = useState<CSSProperties>();
  useEffect(() => {
    let raf = 0;
    let last = "";
    const tick = () => {
      // Landscape phones keep the bar docked at the bottom: the gap is too thin.
      const mid = window.innerHeight >= 500 ? document.querySelector(".arena.arena-wide .midline") : null;
      const r = mid?.getBoundingClientRect();
      // As wide as a mat at most: the midline strip spans the whole column.
      const mat = document.querySelector(".arena.arena-wide .side-field")?.getBoundingClientRect();
      const w = Math.min(r?.width ?? 0, mat?.width ?? Infinity);
      const next = r && w > 0 ? `${Math.round(r.left + r.width / 2)},${Math.round(r.top + r.height / 2)},${Math.round(w)}` : "";
      if (next !== last) {
        last = next;
        const [x, y, w] = next.split(",").map(Number);
        setAnchor(next ? ({ left: x, top: y, "--mid-w": `${w}px` } as CSSProperties) : undefined);
      }
      raf = window.requestAnimationFrame(tick);
    };
    tick();
    return () => window.cancelAnimationFrame(raf);
  }, []);
  return anchor;
}

/**
 * Slim instruction bar for picking cards straight off the board: what to pick
 * and how many, plus the buttons. Desktop: one line in the gap between the
 * mats. Phones: docked over the hand, which can't be played mid-pick. Fixed
 * position and size, so opening it or ticking a card moves nothing.
 */
export function FieldTargetBar({ title, text, caption, label, children }: {
  title: string;
  text: string;
  caption: string;
  label: string;
  children: ReactNode;
}) {
  const mid = useMidlineAnchor();
  return (
    <div className={`field-bar${mid ? " field-bar-mid" : ""}`} style={mid} role="group" aria-label={label}>
      <div className="field-bar-text">
        {/* Effect prompts often already start with the card's name. */}
        {text.startsWith(title) ? null : <strong className="field-bar-title">{title}</strong>}
        <span className="field-bar-prompt">{text}</span>
      </div>
      <div className="field-bar-side">
        <span className="field-bar-count" aria-live="polite">{caption}</span>
        <span className="field-bar-actions">{children}</span>
      </div>
    </div>
  );
}

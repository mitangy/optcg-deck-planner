import { useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PromptSlotContext } from "./promptSlot";
import { useMediaQuery, WIDE_BOARD_QUERY } from "../layout/useMediaQuery";
import "./fieldBar.css";

function useMidlineAnchor(): CSSProperties | undefined {
  const [anchor, setAnchor] = useState<CSSProperties>();
  useEffect(() => {
    let raf = 0;
    let last = "";
    const tick = () => {
      const mid = window.innerHeight >= 500 ? document.querySelector(".arena.arena-wide .midline") : null;
      const r = mid?.getBoundingClientRect();
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

// Fixed position and size, so opening it or ticking a card moves nothing.
export function FieldTargetBar({ title, text, caption, label, handPick = false, children }: {
  title: string;
  text: string;
  caption: string;
  label: string;
  handPick?: boolean;
  children: ReactNode;
}) {
  const mid = useMidlineAnchor();
  const wide = useMediaQuery(WIDE_BOARD_QUERY);
  const { slot } = useContext(PromptSlotContext);
  // Portrait phones: the hand fills the bottom, so the words go up top.
  const top = handPick && !mid && !wide;
  const actions = <span className="field-bar-actions">{children}</span>;
  return (
    <div className={`field-bar${mid ? " field-bar-mid" : top ? " field-bar-top" : ""}`} style={mid} role="group" aria-label={label}>
      <div className="field-bar-text">
        {text.startsWith(title) ? null : <strong className="field-bar-title">{title}</strong>}
        <span className="field-bar-prompt">{text}</span>
      </div>
      <div className="field-bar-side">
        <span className="field-bar-count" aria-live="polite">{caption}</span>
        {top && slot ? createPortal(actions, slot) : actions}
      </div>
    </div>
  );
}

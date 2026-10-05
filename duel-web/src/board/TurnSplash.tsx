import { useEffect, useRef, useState, type CSSProperties } from "react";
import { splashAnchor } from "./splashAnchor";

export type SplashMessage = {
  /** Changing the key replays the splash. */
  key: string;
  title: string;
  sub?: string;
  tone: "mine" | "theirs" | "neutral";
  ms?: number;
};

/**
 * Brief center-board banner ("YOUR TURN", "You go FIRST"). Fixed overlay with
 * pointer-events off, so it never shifts or blocks the board.
 */
export function TurnSplash({ message }: { message: SplashMessage | null }) {
  const [shown, setShown] = useState<SplashMessage | null>(null);
  /** Desktop: the banner sits over the opponent's mat, clear of the End turn dock and your hand. */
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const latest = useRef(message);
  latest.current = message;
  const key = message?.key ?? null;

  // Keyed on the string so re-renders with an equal message don't restart it.
  useEffect(() => {
    const m = latest.current;
    if (!key || !m) return;
    setAnchor(splashAnchor(measureOppMat()));
    setShown(m);
    const id = window.setTimeout(() => setShown(null), m.ms ?? 1500);
    return () => window.clearTimeout(id);
  }, [key]);

  if (!shown) return null;
  return (
    <div
      className={`turn-splash turn-splash-${shown.tone}${anchor ? " turn-splash-anchored" : ""}`}
      style={anchor ? ({ left: anchor.x, top: anchor.y } as CSSProperties) : undefined}
      aria-hidden
      key={shown.key}
    >
      <div
        className="turn-splash-card"
        style={{ "--splash-ms": `${shown.ms ?? 1500}ms` } as CSSProperties}
      >
        <strong>{shown.title}</strong>
        {shown.sub ? <span>{shown.sub}</span> : null}
      </div>
    </div>
  );
}

/** The opponent's mat on the desktop board (null on phones and landscape phones, which keep the centred banner). */
function measureOppMat() {
  const mat = document.querySelector<HTMLElement>(".arena.arena-wide:not(.arena-lp) .side-opp");
  if (!mat) return null;
  const r = mat.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

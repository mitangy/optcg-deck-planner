import { useEffect, useRef, useState, type CSSProperties } from "react";

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
  const latest = useRef(message);
  latest.current = message;
  const key = message?.key ?? null;

  // Keyed on the string so re-renders with an equal message don't restart it.
  useEffect(() => {
    const m = latest.current;
    if (!key || !m) return;
    setShown(m);
    const id = window.setTimeout(() => setShown(null), m.ms ?? 1500);
    return () => window.clearTimeout(id);
  }, [key]);

  if (!shown) return null;
  return (
    <div className={`turn-splash turn-splash-${shown.tone}`} aria-hidden key={shown.key}>
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

import { useEffect, useRef, useState } from "react";
import { useDuelSettings } from "../settings";

const SHOW_MS = 1500;
const FADE_MS = 300;

/**
 * A small "Saved" confirmation after any change to the settings store. It is fixed to the bottom of the window, so
 * showing and hiding it never moves the page. The text only exists while it is showing, so a screen reader
 * announces each save.
 */
export function SavedPill({ signedIn }: { signedIn: boolean }) {
  const settings = useDuelSettings();
  const seen = useRef(settings);
  const [on, setOn] = useState(false);
  const [text, setText] = useState("");
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (seen.current === settings) return;
    seen.current = settings;
    for (const t of timers.current) window.clearTimeout(t);
    setText(signedIn ? "Saved to your account" : "Saved in this browser");
    setOn(true);
    timers.current = [
      window.setTimeout(() => setOn(false), SHOW_MS),
      window.setTimeout(() => setText(""), SHOW_MS + FADE_MS),
    ];
  }, [settings, signedIn]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  return (
    <div className={`saved-pill${on ? " is-on" : ""}`} role="status" aria-live="polite">
      {text ? (
        <>
          <svg className="saved-pill-check" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {text}
        </>
      ) : null}
    </div>
  );
}

import { useEffect, useRef } from "react";
import { matchPath } from "react-router-dom";
import { startProductEvents, track, trackGameDone } from "./events";

/** The pages search engines send people to; every other page is somewhere a visitor already was. */
const LANDER_PATTERNS = [
  "/play-one-piece-tcg-online",
  "/optcg-sim-online",
  "/play-optcg-on-phone",
  "/decks/meta",
  "/leaders",
  "/leaders/:slug",
] as const;

export function isSeoLander(pathname: string): boolean {
  return LANDER_PATTERNS.some((pattern) => matchPath({ path: pattern, end: true }, pathname) !== null);
}

/** Every sign-in prompt in the app is a link to Google sign-in, so one selector finds them all. */
export const SIGN_IN_PROMPT = 'a[href*="/auth/google"]';

const LANDED_KEY = "optcg.landed.v1";

function alreadyLanded(): boolean {
  try {
    if (sessionStorage.getItem(LANDED_KEY)) return true;
    sessionStorage.setItem(LANDED_KEY, "1");
  } catch {
    // Storage blocked: count the page rather than lose the visit.
  }
  return false;
}

export function useProductEvents(pathname: string, emit: typeof track = track): void {
  const first = useRef(true);
  const emitRef = useRef(emit);
  emitRef.current = emit;
  useEffect(() => startProductEvents(), []);

  useEffect(() => {
    if (!first.current) return;
    first.current = false;
    // A reload of the same tab is not a new visit.
    if (!isSeoLander(pathname) || alreadyLanded()) return;
    emitRef.current("landing", { path: pathname });
  }, [pathname]);

  const path = useRef(pathname);
  path.current = pathname;
  useEffect(() => {
    let shownOn: string | null = null;
    const look = () => {
      const now = document.querySelector(SIGN_IN_PROMPT) ? path.current : null;
      if (now !== null && now !== shownOn) emitRef.current("signup_prompt_shown", { path: now });
      shownOn = now;
    };
    look();
    const observer = new MutationObserver(look);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
}

/** One `game_done` each time a game you played ends (a rematch ends again); watching or replaying does not count. */
export function useGameDoneEvent(over: boolean, fallbackMode?: string): void {
  const mode = useRef(fallbackMode);
  mode.current = fallbackMode;
  useEffect(() => {
    if (over) trackGameDone(mode.current);
  }, [over]);
}

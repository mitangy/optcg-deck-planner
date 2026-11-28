import { useEffect, useRef } from "react";
import { matchPath } from "react-router-dom";
import { routeMetaFor } from "../seo/routeMetaTable";
import { gameEvents, startProductEvents, track } from "./events";

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

/** The route pattern ("/leaders/:slug"), so an event never carries an id from the URL. */
export function routePattern(pathname: string): string {
  return routeMetaFor(pathname).pattern;
}

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
  useEffect(() => startProductEvents(), []);

  useEffect(() => {
    if (!first.current) return;
    first.current = false;
    // A reload of the same tab is not a new visit.
    if (!isSeoLander(pathname) || alreadyLanded()) return;
    emit("landing", { path: routePattern(pathname) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
}

/** Records that a player saw a sign-in prompt, once each time one appears. */
export function useSignInPromptShown(pathname: string, emit: typeof track = track): void {
  useEffect(() => {
    emit("signup_prompt_shown", { path: routePattern(pathname) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** game_start on the first view of a new match, game_done when it ends; watching or replaying does not count. */
export function useGameEvents(opts: { matchId: string | null; leaderId: string | null | undefined; over: boolean; playing: boolean; fallbackMode: string }): void {
  const { matchId, leaderId, over, playing, fallbackMode } = opts;
  useEffect(() => {
    if (playing && matchId && leaderId) gameEvents.started(matchId, leaderId, fallbackMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, matchId, leaderId]);
  useEffect(() => {
    if (playing && matchId && over) gameEvents.finished(matchId, fallbackMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, matchId, over]);
}

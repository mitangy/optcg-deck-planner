import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAuthMe, type AuthUser } from "../net/api";
import { fetchTournaments, type TournamentSummary } from "./tournamentApi";

export type Who =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "no-username" }
  | { status: "ready"; user: AuthUser };

/** Who is signed in; tournaments need an account with a username. */
export function useWho(): Who {
  const [who, setWho] = useState<Who>({ status: "loading" });
  useEffect(() => {
    let live = true;
    fetchAuthMe()
      .then((u) => {
        if (!live) return;
        if (!u) setWho({ status: "signed-out" });
        else setWho(u.username ? { status: "ready", user: u } : { status: "no-username" });
      })
      .catch(() => live && setWho({ status: "signed-out" }));
    return () => {
      live = false;
    };
  }, []);
  return who;
}

/** Calls `load` now and every `ms` while the tab is visible. */
export function usePolling(load: () => Promise<void>, ms: number, enabled = true) {
  const ref = useRef(load);
  ref.current = load;
  useEffect(() => {
    if (!enabled) return;
    void ref.current();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void ref.current();
    }, ms);
    const onVisible = () => {
      if (document.visibilityState === "visible") void ref.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, ms]);
}

export function useTournaments(enabled: boolean, ms = 20_000) {
  const [list, setList] = useState<TournamentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    try {
      const next = await fetchTournaments();
      if (!alive.current) return;
      setList(next);
      setError(null);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "Could not load tournaments");
    }
  }, []);
  usePolling(refresh, ms, enabled);
  return { list, error, refresh };
}

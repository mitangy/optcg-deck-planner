import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePolling } from "../lib/usePolling";
import { useAuth } from "../auth/session";
import type { AuthUser } from "../net/api";
import { fetchTournaments, type TournamentSummary } from "./tournamentApi";

export type Who =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "no-username" }
  | { status: "ready"; user: AuthUser };

/** Who is signed in; tournaments need an account with a username. */
export function useWho(): Who {
  const { status, user } = useAuth();
  return useMemo<Who>(() => {
    if (status === "loading") return { status: "loading" };
    if (!user) return { status: "signed-out" };
    return user.username ? { status: "ready", user } : { status: "no-username" };
  }, [status, user]);
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

import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { FriendInvite } from "../../friends/friendsApi";
import type { TimerPreset } from "../../home/timerPreset";
import type { RematchPlan } from "../../state/connectionLoss";

export type TournamentPlay = { code: string; matchId: number; opponent: string; timer: TimerPreset };

export type LobbyHandoff = { matchError?: string; joinInvite?: FriendInvite; tournamentPlay?: TournamentPlay; restartRematch?: RematchPlan | null };

export function readLobbyHandoff(state: unknown): LobbyHandoff {
  return state && typeof state === "object" ? (state as LobbyHandoff) : {};
}

export function useLobbyHandoffs(
  ready: boolean,
  actions: {
    joinInvite: (invite: FriendInvite) => void;
    launchTournamentMatch: (tp: TournamentPlay) => void;
    restartRematch: (plan: RematchPlan) => void;
  },
  /** The restart rematch needs sign-in settled and the friends list answered, which the other handoffs do not. */
  restartReady = ready,
): void {
  const navigate = useNavigate();
  const location = useLocation();
  const handoffInvite = useRef(readLobbyHandoff(location.state).joinInvite ?? null);
  useEffect(() => {
    const invite = handoffInvite.current;
    if (!invite || !ready) return;
    handoffInvite.current = null;
    // Back from the match must not land here and join again.
    navigate("/", { replace: true, state: null });
    actions.joinInvite(invite);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const handoffTournament = useRef(readLobbyHandoff(location.state).tournamentPlay ?? null);
  useEffect(() => {
    const tp = handoffTournament.current;
    if (!tp || !ready) return;
    handoffTournament.current = null;
    navigate("/", { replace: true, state: null });
    actions.launchTournamentMatch(tp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const handoffRestart = useRef(readLobbyHandoff(location.state).restartRematch ?? null);
  useEffect(() => {
    const plan = handoffRestart.current;
    if (!plan || !restartReady) return;
    handoffRestart.current = null;
    navigate("/", { replace: true, state: null });
    actions.restartRematch(plan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartReady]);
}

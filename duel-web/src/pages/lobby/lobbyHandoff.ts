import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { FriendInvite } from "../../friends/friendsApi";
import type { TimerPreset } from "../../home/timerPreset";

export type TournamentPlay = { code: string; matchId: number; opponent: string; timer: TimerPreset };

export type LobbyHandoff = { matchError?: string; joinInvite?: FriendInvite; tournamentPlay?: TournamentPlay; openInviteRoom?: boolean };

export function readLobbyHandoff(state: unknown): LobbyHandoff {
  return state && typeof state === "object" ? (state as LobbyHandoff) : {};
}

export function useLobbyHandoffs(
  ready: boolean,
  actions: { joinInvite: (invite: FriendInvite) => void; launchTournamentMatch: (tp: TournamentPlay) => void; openInviteRoom: () => void },
  /** For handoffs that guests can use too (the others need friends, so a signed-in account). */
  anyoneReady = ready,
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

  const handoffRoom = useRef(readLobbyHandoff(location.state).openInviteRoom === true);
  useEffect(() => {
    if (!handoffRoom.current || !anyoneReady) return;
    handoffRoom.current = false;
    navigate("/", { replace: true, state: null });
    actions.openInviteRoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyoneReady]);
}

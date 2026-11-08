import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { FriendInvite } from "../../friends/friendsApi";
import type { TimerPreset } from "../../home/timerPreset";

export type TournamentPlay = { code: string; matchId: number; opponent: string; timer: TimerPreset };

/**
 * What other pages leave in the lobby's `location.state`: DuelPage sends back a failed match request
 * (`matchError`) or a Join tapped on the waiting board (`joinInvite`), TournamentPage a Play tap (`tournamentPlay`).
 */
export type LobbyHandoff = { matchError?: string; joinInvite?: FriendInvite; tournamentPlay?: TournamentPlay };

export function readLobbyHandoff(state: unknown): LobbyHandoff {
  return state && typeof state === "object" ? (state as LobbyHandoff) : {};
}

/**
 * Join tapped on the waiting board, or Play tapped on a tournament page: wait for sign-in and the deck, then
 * run it once. The state is cleared first, so Back from the match never lands here and starts it again.
 */
export function useLobbyHandoffs(
  ready: boolean,
  actions: { joinInvite: (invite: FriendInvite) => void; launchTournamentMatch: (tp: TournamentPlay) => void },
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
}

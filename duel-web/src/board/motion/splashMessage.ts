import type { PlayerView, Seat, SeatPlayers } from "../../net/protocol";
import { seatLabel } from "../match/playerNames";
import type { SplashMessage } from "./TurnSplash";

// What the turn splash announces: the opening order during the mulligan, then each turn change.
export function splashMessageFor({
  over,
  prefs,
  replayQuiet,
  mulliganPhase,
  decidingMulligan,
  spectating,
  matchId,
  boardSeat,
  youFirst,
  view,
  players,
  youActive,
}: {
  over: boolean;
  prefs: { turnSplash: boolean };
  replayQuiet: boolean;
  mulliganPhase: boolean;
  decidingMulligan: boolean;
  spectating: boolean;
  matchId: string | null;
  boardSeat: Seat;
  youFirst: boolean;
  view: PlayerView;
  players: SeatPlayers | null;
  youActive: boolean;
}): SplashMessage | null {
  // While you decide, the opening hand says who goes first, so the splash would only sit on the cards.
  const splash: SplashMessage | null = over || !prefs.turnSplash || replayQuiet || decidingMulligan
    ? null
    : mulliganPhase
      ? spectating
        ? null
        : {
            key: `order-${matchId ?? ""}-${boardSeat}`,
            title: youFirst ? "You go first" : "You go second",
            sub: youFirst ? "No draw · 1 DON!! on turn 1" : "You draw · 2 DON!! on turn 1",
            tone: youFirst ? "mine" : "theirs",
            ms: 3200,
          }
      : {
          key: `turn-${view.turnNumber}-${view.activeSeat}`,
          title: spectating
            ? `${seatLabel(players, view.activeSeat)}'s turn`
            : youActive
              ? "Your turn"
              : "Opponent's turn",
          sub:
            view.turnNumber <= 2 && !spectating
              ? `Turn ${view.turnNumber} · you went ${youFirst ? "first" : "second"}`
              : `Turn ${view.turnNumber}`,
          tone: spectating ? "neutral" : youActive ? "mine" : "theirs",
        };
  return splash;
}

import type { ReactNode } from "react";
import type { DiceResult, PlayerView, Seat, SeatPlayers } from "../../net/protocol";
import type { DuelSettings } from "../../settings";
import { firstSeatLine } from "./firstSeatLine";
import { seatName } from "./playerNames";

// The note shown in the mulligan banner (or beside the actions dock) once you locked in your choice.
export function mulliganBodyFor({
  view,
  spectating,
  mulliganPhase,
}: {
  view: PlayerView;
  spectating: boolean;
  mulliganPhase: boolean;
}): ReactNode {
  const mulliganBody =
    mulliganPhase && !spectating && view.you.mulliganDone ? (
      <>
        <strong>Mulligan locked in.</strong> Waiting for the other seat
        {view.opponent.mulliganDone ? "" : " — pass the device if this is hotseat"}.
      </>
    ) : null;
  return mulliganBody;
}

// The lines over and under the opening hand while you decide: who goes first, and the optional explainer.
export function mulliganOpeningFor({
  decidingMulligan,
  prefs,
  youFirst,
  boardSeat,
  oppSeat,
  players,
  firstSeatPickedBy,
  firstSeatDice,
}: {
  decidingMulligan: boolean;
  prefs: DuelSettings;
  youFirst: boolean;
  boardSeat: Seat;
  oppSeat: Seat;
  players: SeatPlayers | null;
  firstSeatPickedBy: Seat | null | undefined;
  firstSeatDice: DiceResult | null | undefined;
}): { mulliganOrder: ReactNode; mulliganHint: string | null } {
  const mulliganOrder = decidingMulligan ? (
    <>
      <strong>
        {firstSeatLine({
          youFirst,
          boardSeat,
          pickedBy: firstSeatPickedBy,
          dice: firstSeatDice,
          opponentName: seatName(players, oppSeat) ?? undefined,
        })}
      </strong>
      {" · "}
      {youFirst ? "No draw, 1 DON!! on turn 1" : "You draw, 2 DON!! on turn 1"}
    </>
  ) : null;
  const mulliganHint = decidingMulligan && prefs.gameHints
    ? "Keep these cards, or mulligan to shuffle them back and draw 5 new ones. Life is dealt after both players decide."
    : null;
  return { mulliganOrder, mulliganHint };
}

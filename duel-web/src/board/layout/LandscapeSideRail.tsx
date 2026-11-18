import type { ReactNode } from "react";
import type { Seat, SeatPlayers, PlayerView } from "../../net/protocol";
import type { DuelSettings } from "../../settings";
import { SpectatorFarHand } from "../hand/SpectatorFarHand";
import { HudUndoPass } from "../hud/BoardHud";
import type { UndoUi, BoardUndo } from "../match/undoHud";
import { seatLabel } from "../match/playerNames";
import { OppHandCorner, OppHandFan, TurnStatusPanel } from "../panels/TurnStatusPanel";
import type { usePhoneResize } from "../panels/usePhoneResize";
import type { spectatorFans } from "../hand/handLayout";
import type { seatClockLabels } from "../match/useMatchClocks";

export type LandscapeSideRailProps = {
  view: PlayerView;
  prefs: DuelSettings;
  players: SeatPlayers | null;
  boardSeat: Seat;
  oppSeat: Seat;
  firstSeat: Seat;
  spectating: boolean;
  over: boolean;
  compactHud: boolean;
  hotseatPass: { otherSeat: Seat; onPass: () => void } | undefined;
  undo: BoardUndo | undefined;
  undoUi: UndoUi;
  specFans: ReturnType<typeof spectatorFans>;
  farHand: NonNullable<PlayerView["revealedHands"]>[Seat] | undefined;
  shownFarHand: React.ComponentProps<typeof OppHandCorner>["cards"];
  oppHandRight: boolean;
  oppCardBackUrl: string | null;
  turnClock: string | null;
  matchClock: string | null;
  seatClocks: ReturnType<typeof seatClockLabels>;
  defendTray: ReactNode;
  handPanel: ReactNode;
  fanHand: boolean;
  intentPanel: ReactNode;
  phoneResize: ReturnType<typeof usePhoneResize>;
};

// The phone-landscape right rail: opp hand, turn status, hand (or Defend tray) and the action bar.
export function LandscapeSideRail({
  view,
  prefs,
  players,
  boardSeat,
  oppSeat,
  firstSeat,
  spectating,
  over,
  compactHud,
  hotseatPass,
  undo,
  undoUi,
  specFans,
  farHand,
  shownFarHand,
  oppHandRight,
  oppCardBackUrl,
  turnClock,
  matchClock,
  seatClocks,
  defendTray,
  handPanel,
  fanHand,
  intentPanel,
  phoneResize,
}: LandscapeSideRailProps) {
  const opp = view.opponent;
  const { undoState, undoPendingTheirs, undoNothingYet } = undoUi;
  return (
    <div className="arena-rail board-col">
      {hotseatPass || (undo && undoState?.enabled && !spectating && !over) ? (
        <div className="lp-actions">
          <HudUndoPass ui={undoUi} hidden={undoPendingTheirs || (compactHud && undoNothingYet)} spectating={spectating} over={over} hotseatPass={hotseatPass} />
        </div>
      ) : null}
      {farHand && specFans === "landscape" ? (
        <SpectatorFarHand
          cards={farHand}
          ownerSeat={oppSeat}
          mode="landscape"
          name={seatLabel(players, oppSeat)}
        />
      ) : oppHandRight ? (
        <OppHandCorner count={opp.handCount} cardBackUrl={oppCardBackUrl} variant="row" cards={shownFarHand} ownerSeat={oppSeat} />
      ) : (
        <OppHandFan
          count={opp.handCount}
          cardBackUrl={oppCardBackUrl}
          compact
          cards={shownFarHand}
          ownerSeat={oppSeat}
        />
      )}
      {defendTray ? null : (
        <TurnStatusPanel
          view={view}
          boardSeat={boardSeat}
          firstSeat={firstSeat}
          players={players}
          spectating={spectating}
          turnClock={turnClock}
          matchClock={matchClock}
          seatClocks={seatClocks}
          compact
        />
      )}
      {defendTray ?? handPanel ?? (fanHand ? <div className="lp-rail-fill" aria-hidden /> : null)}
      {intentPanel}
      {prefs.layoutGrips ? <div className="phone-resize phone-resize-rail" {...phoneResize.handleProps("rail")} /> : null}
    </div>
  );
}

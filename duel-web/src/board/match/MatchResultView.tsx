import { Dialog, DialogTitle } from "@optcg/ui/popups";
import type { MatchOverMessage, PlayerView, RematchAction, RematchState, Seat, SeatPlayers } from "../../net/protocol";
import type { RematchDeckOption } from "../../decks/rematchDecks";
import { openReport } from "../../reports/reportDialog";
import { matchReportTarget } from "../../reports/reportTargets";
import { MatchLogLinks, MatchOverFactsLine, ReviewGameSlot, useMatchOverFacts, type LoadMatchRecord } from "./MatchOverFacts";
import type { describeMatchResult } from "./matchResult";
import { winnerHeadline } from "./playerNames";
import { RematchPanel, rematchStage, type RematchDecks } from "./RematchPanel";

const noop = () => {};

export type BoardRematch = {
  state: RematchState | null;
  onAction: (action: RematchAction, decks?: RematchDecks) => void;
  autoAccept?: boolean;
  deckOptions?: readonly RematchDeckOption[];
};

export function MatchResultView({
  over,
  resultHidden,
  setResultHidden,
  result,
  isReplay,
  wide,
  lp,
  matchOver,
  view,
  spectating,
  players,
  matchId,
  loadMatchRecord,
  rematch,
  boardSeat,
  canReportPlayer,
  reportTargetFor,
  onLeave,
}: {
  over: boolean;
  resultHidden: boolean;
  setResultHidden: (hidden: boolean) => void;
  result: ReturnType<typeof describeMatchResult>;
  isReplay: boolean;
  wide: boolean;
  lp: boolean;
  matchOver: MatchOverMessage["result"] | null;
  view: PlayerView;
  spectating: boolean;
  players: SeatPlayers | null;
  matchId: string | null;
  loadMatchRecord: LoadMatchRecord | undefined;
  rematch: BoardRematch | undefined;
  boardSeat: Seat;
  canReportPlayer: boolean;
  reportTargetFor: (source: "match" | "spectate" | "postmatch") => ReturnType<typeof matchReportTarget>;
  onLeave: () => void;
}) {
  const facts = useMatchOverFacts(over ? matchId : null, view.turnNumber, spectating ? undefined : loadMatchRecord);
  const offersRematch = rematch != null && !spectating;
  // Gold goes to the rematch offer; with none (or no rematch possible) Return home takes it. Spectators have no gold button.
  const stage = rematchStage(offersRematch ? rematch.state : null, boardSeat, rematch?.autoAccept);
  const homePrimary = !spectating && (stage === "none" || stage === "left");
  return (
    <>
      {over && resultHidden && !(isReplay && !(wide && !lp)) ? (
        <div
          className={`match-result-pill match-result-${result.outcome}${wide && !lp ? " match-result-pill-rail" : ""}`}
          role="status"
        >
          <span>
            Match over · {result.headline}
          </span>
          <button type="button" className="btn btn-secondary" onClick={() => setResultHidden(false)}>
            Show result
          </button>
        </div>
      ) : null}

      {over && !resultHidden ? (
        <Dialog
          open
          onClose={noop}
          className="modal-backdrop"
          panelClassName={`modal-card match-result match-result-${result.outcome}`}
        >
          <p className="match-result-kicker">Match over</p>
          <DialogTitle as="h2">
            {(() => {
              const winner = (matchOver?.winner ?? view.winner) as Seat | null;
              return (spectating || isReplay) && players && (winner === 0 || winner === 1)
                ? winnerHeadline(players, winner, null, true)
                : result.headline;
            })()}
          </DialogTitle>
          <p className="match-result-detail">{result.detail}</p>
          <MatchOverFactsLine facts={facts} />
          {offersRematch ? (
            <RematchPanel
              state={rematch.state}
              mySeat={boardSeat}
              players={players}
              autoAccept={rematch.autoAccept}
              deckOptions={rematch.deckOptions}
              onAction={rematch.onAction}
            />
          ) : null}
          <div className="match-result-secondary">
            <ReviewGameSlot facts={facts} enabled={!spectating && loadMatchRecord != null} />
            <button type="button" className="btn btn-secondary match-result-board" onClick={() => setResultHidden(true)}>
              View board
            </button>
            <button
              type="button"
              className={`btn ${homePrimary ? "btn-primary" : "btn-secondary"} match-result-home`}
              onClick={onLeave}
            >
              {homePrimary ? "Return home" : "Home"}
            </button>
          </div>
          <MatchLogLinks facts={facts} />
          {!spectating && canReportPlayer ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm match-result-report"
              onClick={() => {
                const target = reportTargetFor("postmatch");
                if (target) openReport(target);
              }}
            >
              Report player
            </button>
          ) : null}
        </Dialog>
      ) : null}
    </>
  );
}

import { Dialog, DialogTitle } from "@optcg/ui/popups";
import type { MatchOverMessage, PlayerView, RematchAction, RematchState, Seat, SeatPlayers } from "../../net/protocol";
import type { RematchDeckOption } from "../../decks/rematchDecks";
import { openReport } from "../../reports/reportDialog";
import { matchReportTarget } from "../../reports/reportTargets";
import { MatchOverFactsList, type LoadMatchRecord } from "./MatchOverFacts";
import type { describeMatchResult } from "./matchResult";
import { winnerHeadline } from "./playerNames";
import { RematchPanel, type RematchDecks } from "./RematchPanel";

/** The match result is not dismissed by Escape or an outside click; its buttons leave it. */
const noop = () => {};

/** Rematch vote on the match-over screen (unranked rooms). */
export type BoardRematch = {
  state: RematchState | null;
  onAction: (action: RematchAction, decks?: RematchDecks) => void;
  autoAccept?: boolean;
  /** Saved decks to switch to for the next game. */
  deckOptions?: readonly RematchDeckOption[];
};

/** The match-over card, or (once "View board" tucked it away) the pill that brings it back. */
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
        // Blocking: Escape and an outside click do nothing; "View board" tucks the result away.
        <Dialog
          open
          onClose={noop}
          className="modal-backdrop"
          panelClassName={`modal-card match-result match-result-${result.outcome}`}
        >
          <p className="match-result-kicker">Match over</p>
          <DialogTitle as="h2">
            {(() => {
              // Spectators / hotseat: name the winning player instead of "Seat N".
              const winner = (matchOver?.winner ?? view.winner) as Seat | null;
              return (spectating || isReplay) && players && (winner === 0 || winner === 1)
                ? winnerHeadline(players, winner, null, true)
                : result.headline;
            })()}
          </DialogTitle>
          <p className="match-result-detail">{result.detail}</p>
          <MatchOverFactsList
            matchId={matchId}
            turnNumber={view.turnNumber}
            loadRecord={spectating ? undefined : loadMatchRecord}
          />
          <button type="button" className="btn btn-secondary match-result-board" onClick={() => setResultHidden(true)}>
            View board
          </button>
          {rematch && !spectating ? (
            <RematchPanel
              state={rematch.state}
              mySeat={boardSeat}
              players={players}
              autoAccept={rematch.autoAccept}
              deckOptions={rematch.deckOptions}
              onAction={rematch.onAction}
            />
          ) : null}
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
          <button type="button" className="leave-btn" onClick={onLeave}>
            Return home
          </button>
        </Dialog>
      ) : null}
    </>
  );
}

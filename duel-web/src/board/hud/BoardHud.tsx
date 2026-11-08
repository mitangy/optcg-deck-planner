import type { ReactNode } from "react";
import type { PlayerView, Seat, SeatPlayers } from "../../net/protocol";
import { ConfirmButton } from "../prompts/ConfirmButton";
import { phaseLabel } from "../panels/phaseLabel";
import { playerLabel, seatLabel, seatName } from "../match/playerNames";
import { RoomChip } from "../match/RoomShare";
import type { TabMute } from "../audio/tabMute";
import type { SeatClocks } from "../panels/TurnStatusPanel";
import { UndoControl } from "../match/UndoControl";
import type { UndoUi } from "../match/undoHud";

export type MatchMenuPlacement = "top" | "left" | "anchor";

/** Mute this tab: a fixed-size speaker so flipping state never moves its neighbours (#934). */
function MuteTabButton({ className, tabMute, tabMuteText }: { className: string; tabMute: TabMute; tabMuteText: { label: string; title: string } }) {
  return (
    <button
      type="button"
      className={`${className} tab-mute-btn`}
      aria-label={tabMuteText.label}
      aria-pressed={tabMute.silenced}
      title={tabMuteText.title}
      onClick={tabMute.toggle}
    >
      <span className="tab-mute-icon" aria-hidden>
        {tabMute.silenced ? "🔇" : "🔊"}
      </span>
    </button>
  );
}

function FullscreenButton({ className, isFullscreen, onToggle }: { className: string; isFullscreen: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={className}
      aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
      aria-pressed={isFullscreen}
      title={isFullscreen ? "Exit full screen" : "Full screen"}
      onClick={onToggle}
    >
      {isFullscreen ? "⤡" : "⛶"}
    </button>
  );
}

/** MULLIGAN / YOUR TURN / OPPONENT'S TURN, and the SPECTATOR / REPLAY chip. */
function TurnChips({
  mulliganPhase,
  decidingMulligan,
  yourTurn,
  oppActive,
  spectating,
  isReplay,
}: {
  mulliganPhase: boolean;
  decidingMulligan: boolean;
  yourTurn: boolean;
  oppActive: boolean;
  spectating: boolean;
  isReplay: boolean;
}) {
  return (
    <>
      {mulliganPhase && decidingMulligan ? (
        <span className="hud-turn-chip">MULLIGAN</span>
      ) : yourTurn && !isReplay ? (
        <span className="hud-turn-chip hud-turn-mine">YOUR TURN</span>
      ) : oppActive && !spectating && !isReplay ? (
        <span className="hud-turn-chip hud-turn-theirs">OPPONENT&apos;S TURN</span>
      ) : null}
      {spectating || isReplay ? <span className="hud-turn-chip">{isReplay ? "REPLAY" : "SPECTATOR"}</span> : null}
    </>
  );
}

/** The undo (or "waiting for the answer, cancel") button and the hotseat pass-the-device button. */
export function HudUndoPass({
  ui,
  hidden,
  spectating,
  over,
  hotseatPass,
}: {
  ui: UndoUi;
  /** The Undo menu is not offered right now (their request is up, or nothing to undo on the compact bar). */
  hidden: boolean;
  spectating: boolean;
  over: boolean;
  hotseatPass: { otherSeat: Seat; onPass: () => void } | undefined;
}) {
  const { undo, undoState, undoPendingMine } = ui;
  return (
    <>
    {undo && undoState?.enabled && !spectating && !over ? (
      undoPendingMine ? (
        <button
          type="button"
          className="hud-undo-btn hud-icon-btn hud-undo-cancel armed"
          aria-label="Cancel undo request"
          title="Waiting for your opponent to accept. Press to cancel."
          onClick={() => undo.onAction("cancel")}
        >
          ↺ Cancel
        </button>
      ) : hidden ? null : (
        <UndoControl
          className="hud-undo-btn hud-icon-btn"
          label="↺"
          ariaLabel="Undo"
          state={undoState}
          autoAccept={undo.autoAccept === true}
          defaultOpen={undo.defaultOpen}
          onAction={undo.onAction}
        />
      )
    ) : null}
    {hotseatPass ? (
      // The phone bar is tight: "→ P2" here, the full wording in its name.
      <button
        type="button"
        className="hud-pass-btn"
        title={`Hand the device to ${playerLabel(hotseatPass.otherSeat)}`}
        aria-label={`Switch to ${playerLabel(hotseatPass.otherSeat)}`}
        onClick={hotseatPass.onPass}
      >
        → P{hotseatPass.otherSeat + 1}
      </button>
    ) : null}
    </>
  );
}

export type BoardHudProps = {
  /** `full`: the computer's top bar. `compact`: the phone bar. `column`: the no-top-bar action row. */
  variant: "full" | "compact" | "column";
  view: PlayerView;
  players: SeatPlayers | null;
  matchId: string | null;
  boardSeat: Seat;
  oppSeat: Seat;
  spectating: boolean;
  isReplay: boolean;
  over: boolean;
  yourTurn: boolean;
  oppActive: boolean;
  mulliganPhase: boolean;
  decidingMulligan: boolean;
  youFirst: boolean;
  orderLabel: string;
  /** The chess-clock readouts, formatted once by the board. */
  turnClock: string | null;
  matchClock: string | null;
  seatClocks: SeatClocks | null;
  logPoseButton: ReactNode;
  /** The match menu for a placement (the board owns its items). */
  matchMenu: (placement: MatchMenuPlacement) => ReactNode;
  undoUi: UndoUi;
  /** The Undo menu is not offered right now (see HudUndoPass). */
  undoHidden: boolean;
  hotseatPass: { otherSeat: Seat; onPass: () => void } | undefined;
  tabMute: TabMute;
  tabMuteText: { label: string; title: string };
  fullscreenOffered: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onSettings: () => void;
  onReportProblem: () => void;
  canReportPlayer: boolean;
  onReportPlayer: () => void;
  onConcede: (() => void) | undefined;
  leaveLabel: string;
  onLeave: () => void;
};

/**
 * The match HUD in its three forms (they differ in wording where the phone bar is tight): the computer's top
 * bar, the phone bar, and the action row that replaces the top bar on a bigger playing area.
 */
export function BoardHud(p: BoardHudProps) {
  const {
    variant,
    view,
    players,
    matchId,
    boardSeat,
    oppSeat,
    spectating,
    isReplay,
    over,
    yourTurn,
    oppActive,
    mulliganPhase,
    decidingMulligan,
    youFirst,
    orderLabel,
    turnClock,
    matchClock,
    seatClocks,
    logPoseButton,
    matchMenu,
    undoUi,
    undoHidden,
    hotseatPass,
    tabMute,
    tabMuteText,
    fullscreenOffered,
    isFullscreen,
    onToggleFullscreen,
    onSettings,
    onReportProblem,
    canReportPlayer,
    onReportPlayer,
    onConcede,
    leaveLabel,
    onLeave,
  } = p;
  const { undo, undoState, undoPendingMine, undoPendingTheirs } = undoUi;
  const turnChips = (
    <TurnChips
      mulliganPhase={mulliganPhase}
      decidingMulligan={decidingMulligan}
      yourTurn={yourTurn}
      oppActive={oppActive}
      spectating={spectating}
      isReplay={isReplay}
    />
  );
  const undoPass = (
    <HudUndoPass ui={undoUi} hidden={undoHidden} spectating={spectating} over={over} hotseatPass={hotseatPass} />
  );

  if (variant === "column") {
    /** The no-top-bar action row: same buttons as the phone bar, a fixed height so nothing moves when one comes or goes. */
    return (
      <div className="col-actions">
        {logPoseButton}
        {undoPass}
        {fullscreenOffered ? (
          <FullscreenButton
            className="hud-undo-btn hud-icon-btn hud-fullscreen-btn"
            isFullscreen={isFullscreen}
            onToggle={onToggleFullscreen}
          />
        ) : null}
        <MuteTabButton className="hud-undo-btn hud-icon-btn" tabMute={tabMute} tabMuteText={tabMuteText} />
        {matchMenu("anchor")}
      </div>
    );
  }

  if (variant === "compact") {
    return (
        <header className="hud-bar hud-compact">
          <div className={`hud-status${yourTurn ? " pulse" : ""}`}>
            {mulliganPhase && decidingMulligan ? null : (
              <>
                <span className="hud-phase">{phaseLabel(view.phase)}</span>
                <span className="hud-sep">·</span>
              </>
            )}
            <span className="hud-turn-num">T{view.turnNumber}</span>
            {turnChips}
            {turnClock ? (
              <span className="hud-turn-chip hud-timer" title="Turn clock">
                {turnClock}
              </span>
            ) : null}
            {matchClock ? (
              <span className="hud-turn-chip hud-timer" title="Match clock">
                Match {matchClock}
              </span>
            ) : null}
            {seatClocks ? (
              <span
                className="hud-turn-chip hud-timer hud-clock-pair"
                title={`${spectating ? playerLabel(boardSeat) : "Your"} time ${seatClocks.you} · ${
                  spectating ? playerLabel(oppSeat) : "Opponent's"
                } time ${seatClocks.opp}`}
              >
                <span
                  className={`hud-seat-clock${seatClocks.running === "you" ? " running" : ""}${
                    seatClocks.youLow ? " low" : ""
                  }`}
                >
                  {seatClocks.you}
                </span>
                <span className="hud-sep">/</span>
                <span
                  className={`hud-seat-clock${seatClocks.running === "opp" ? " running" : ""}${
                    seatClocks.oppLow ? " low" : ""
                  }`}
                >
                  {seatClocks.opp}
                </span>
              </span>
            ) : null}
          </div>
          <div className="hud-actions">
            {logPoseButton}
            {undoPass}
            {matchMenu("top")}
          </div>
        </header>
    );
  }

  return (
        <header className="hud-bar">
          <div className="hud-brand">OPTCG DUEL</div>
          <div className={`hud-status${yourTurn ? " pulse" : ""}`}>
            <span className="hud-phase">{phaseLabel(view.phase)}</span>
            <span className="hud-sep">·</span>
            <span>Turn {view.turnNumber}</span>
            <span className="hud-sep">·</span>
            {players ? (
              <span
                className="hud-names"
                title={`${seatLabel(players, spectating ? 0 : boardSeat)} vs ${seatLabel(
                  players,
                  spectating ? 1 : oppSeat,
                )}`}
              >
                <strong className="hud-name hud-name-you">
                  {spectating ? seatLabel(players, 0) : seatName(players, boardSeat) ?? "You"}
                </strong>
                <span className="hud-sep">vs</span>
                <span className="hud-name">
                  {seatLabel(players, spectating ? 1 : oppSeat)}
                </span>
              </span>
            ) : spectating ? (
              <span>{isReplay ? "Replay" : "Spectating"}</span>
            ) : null}
            <span className={`hud-turn-chip hud-order${youFirst ? " first" : ""}`}>
              {orderLabel}
            </span>
            {turnChips}
            {turnClock ? (
              <span className="hud-turn-chip hud-timer" title="Turn clock">
                Turn {turnClock}
              </span>
            ) : null}
            {matchClock ? (
              <span className="hud-turn-chip hud-timer" title="Match clock">
                Match {matchClock}
              </span>
            ) : null}
            {seatClocks ? (
              <>
                <span
                  className={`hud-turn-chip hud-timer hud-seat-clock${
                    seatClocks.running === "you" ? " running" : ""
                  }${seatClocks.youLow ? " low" : ""}`}
                  title="Your time"
                >
                  {spectating ? seatLabel(players, boardSeat) : "You"} {seatClocks.you}
                </span>
                <span
                  className={`hud-turn-chip hud-timer hud-seat-clock${
                    seatClocks.running === "opp" ? " running" : ""
                  }${seatClocks.oppLow ? " low" : ""}`}
                  title="Opponent's time"
                >
                  {spectating ? seatLabel(players, oppSeat) : "Opp"} {seatClocks.opp}
                </span>
              </>
            ) : null}
          </div>
          <div className="hud-actions">
            {logPoseButton}
            {hotseatPass || isReplay ? null : <RoomChip roomId={matchId} />}
            {undo && undoState?.enabled && !spectating && !over ? (
              undoPendingMine ? (
                <button
                  type="button"
                  className="hud-undo-btn armed"
                  title="Waiting for your opponent to accept — click to cancel"
                  onClick={() => undo.onAction("cancel")}
                >
                  Undo asked · Cancel
                </button>
              ) : undoPendingTheirs ? null : (
                <UndoControl
                  className="hud-undo-btn"
                  label="↺ Undo"
                  state={undoState}
                  autoAccept={undo.autoAccept === true}
                  defaultOpen={undo.defaultOpen}
                  onAction={undo.onAction}
                />
              )
            ) : null}
            {hotseatPass ? (
              <button
                type="button"
                className="hud-pass-btn"
                title={`Hand the device to ${playerLabel(hotseatPass.otherSeat)}`}
                onClick={hotseatPass.onPass}
              >
                Switch to {playerLabel(hotseatPass.otherSeat)}
              </button>
            ) : null}
            {onConcede && !spectating && !over ? (
              <ConfirmButton
                className="hud-concede-btn"
                label="Concede"
                confirmLabel="Confirm concede"
                title="Forfeit this match"
                onConfirm={onConcede}
              />
            ) : null}
            <MuteTabButton className="hud-undo-btn hud-settings-btn" tabMute={tabMute} tabMuteText={tabMuteText} />
            {fullscreenOffered ? (
              <FullscreenButton
                className="hud-undo-btn hud-settings-btn"
                isFullscreen={isFullscreen}
                onToggle={onToggleFullscreen}
              />
            ) : null}
            <button
              type="button"
              className="hud-undo-btn hud-settings-btn"
              aria-label="Gameplay settings"
              title="Gameplay settings"
              onClick={onSettings}
            >
              ⚙
            </button>
            <button
              type="button"
              className="hud-undo-btn hud-settings-btn"
              aria-label="Report a problem"
              title="Report a problem"
              onClick={onReportProblem}
            >
              ⚑
            </button>
            {canReportPlayer ? (
              <button
                type="button"
                className="hud-undo-btn hud-settings-btn"
                aria-label="Report player"
                title="Report player"
                onClick={onReportPlayer}
              >
                ⚠
              </button>
            ) : null}
            <button type="button" className="leave-btn" onClick={onLeave}>
              {leaveLabel}
            </button>
          </div>
        </header>
  );
}

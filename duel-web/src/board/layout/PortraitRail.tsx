import type { ReactNode, RefObject, CSSProperties } from "react";
import type { Seat, SeatPlayers, PlayerView } from "../../net/protocol";
import type { BattleLogEntry } from "../match/battleLog";
import { HandLabel } from "../hand/HandLabel";
import { seatLabel } from "../match/playerNames";
import { BattleLogPanel } from "../panels/BattleLogPanel";

export type PortraitRailProps = {
  boardSeat: Seat;
  mySeat: Seat | null;
  players: SeatPlayers | null;
  spectating: boolean;
  specFans: "desktop" | "portrait" | "landscape" | null;
  specGrid: boolean;
  nearHand: NonNullable<PlayerView["revealedHands"]>[Seat] | undefined;
  handCount: number;
  handCollapsed: boolean;
  handPick: boolean;
  phoneFan: boolean;
  handRowRef: RefObject<HTMLDivElement | null>;
  toggleHandCollapsed: () => void;
  sortHandBtn: ReactNode;
  renderHandCards: (fanned?: boolean) => ReactNode;
  defendTray: ReactNode;
  intentPanel: ReactNode;
  battleLog: BattleLogEntry[];
  logCollapsed: boolean;
  onToggleLog: () => void;
  chatPanel: ReactNode;
};

// The portrait-phone bottom rail: hand (or Defend tray), action bar, battle log and chat.
export function PortraitRail({
  boardSeat,
  mySeat,
  players,
  spectating,
  specFans,
  specGrid,
  nearHand,
  handCount,
  handCollapsed,
  handPick,
  phoneFan,
  handRowRef,
  toggleHandCollapsed,
  sortHandBtn,
  renderHandCards,
  defendTray,
  intentPanel,
  battleLog,
  logCollapsed,
  onToggleLog,
  chatPanel,
}: PortraitRailProps) {
  return (
    <div className="arena-rail">
      {defendTray ?? (
        <div className={`hand-rail${handCollapsed && !handPick ? " collapsed" : ""}`}>
          <div className={`hand-rail-head${specFans && nearHand ? " hand-rail-head-spec" : ""}`}>
            {specFans && nearHand ? (
              <HandLabel name={seatLabel(players, boardSeat)} count={handCount} />
            ) : (
              <>
                {spectating ? (
                  <>
                    <span className="hand-rail-title">{nearHand ? "Seat hand" : "Seat hand (hidden)"}</span>
                    <span className="hand-rail-count">{handCount}</span>
                  </>
                ) : (
                  <button
                    type="button"
                    className="hand-rail-toggle"
                    aria-expanded={!(handCollapsed && !handPick)}
                    aria-label={`${handCollapsed && !handPick ? "Show" : "Hide"} your hand, ${handCount} cards`}
                    onClick={toggleHandCollapsed}
                  >
                    <span className="hand-rail-title">Hand</span>
                    <span className="hand-rail-count">{handCount}</span>
                  </button>
                )}
              </>
            )}
            {!spectating ? (
              <div className="hand-rail-actions">
                {sortHandBtn}
                <button
                  type="button"
                  className="hand-rail-btn hand-collapse-btn"
                  onClick={toggleHandCollapsed}
                >
                  {handCollapsed && !handPick ? "Show" : "Hide"}
                </button>
              </div>
            ) : null}
          </div>
          {phoneFan ? (
            <div className="hand-row hand-row-fan" ref={handRowRef}>
              <div
                className="hand-row-inner hand-fan-cards"
                style={{ "--n": Math.max(handCount, 1) } as CSSProperties}
              >
                {renderHandCards(true)}
              </div>
            </div>
          ) : (
            <div className={`hand-row${specGrid ? " hand-row-spec-grid" : ""}`} ref={handRowRef}>
              <div className="hand-row-inner">{renderHandCards()}</div>
            </div>
          )}
        </div>
      )}

      {intentPanel}

      <BattleLogPanel
        entries={battleLog}
        viewingSeat={spectating || mySeat == null ? undefined : mySeat}
        collapsed={logCollapsed}
        onToggle={onToggleLog}
      />

      {chatPanel}
    </div>
  );
}

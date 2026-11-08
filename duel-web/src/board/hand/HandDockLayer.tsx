import type { CSSProperties, ReactNode, RefObject } from "react";
import type { DuelSettings } from "../../settings";
import type { SeatPlayers, Seat } from "../../net/protocol";
import { CornerFit } from "../layout/CornerFit";
import type { fanCornerFor } from "./fanCorner";
import { HandFan } from "./HandFan";
import type { handDrawer } from "./handFanGeometry";
import type { parseFanPos } from "./handFanPos";
import type { spectatorFans } from "./handLayout";
import { seatLabel } from "../match/playerNames";
import type { useFanMove } from "./useFanMove";

/**
 * The hand off the bottom of the board: the fan (centre, a corner, docked or dragged anywhere) on a desktop
 * board, or the dock on a wide board without a rail hand.
 */
export function HandDockLayer({
  fanHand,
  fanRef,
  handRowRef,
  fanCorner,
  shownFanPos,
  fanFloating,
  fanMove,
  drawer,
  drawerClass,
  handOpen,
  handUp,
  handHidden,
  handTucked,
  tuckUnderPointer,
  setTuckUnderPointer,
  fanHoverUp,
  setFanHoverUp,
  handCount,
  specFans,
  players,
  boardSeat,
  spectating,
  prefs,
  wide,
  railHand,
  setHandHidden,
  setHandPinned,
  toggleHandUp,
  dropHandClickFocus,
  specGrip,
  specHandToggle,
  sortHandBtn,
  hideHandBtn,
  renderHandCards,
}: {
  fanHand: boolean;
  fanRef: RefObject<HTMLDivElement | null>;
  handRowRef: RefObject<HTMLDivElement | null>;
  fanCorner: ReturnType<typeof fanCornerFor>;
  shownFanPos: ReturnType<typeof parseFanPos>;
  fanFloating: boolean;
  fanMove: ReturnType<typeof useFanMove>;
  drawer: ReturnType<typeof handDrawer>;
  drawerClass: string;
  handOpen: boolean;
  handUp: boolean;
  handHidden: boolean;
  handTucked: boolean;
  tuckUnderPointer: boolean;
  setTuckUnderPointer: (under: boolean) => void;
  fanHoverUp: boolean;
  setFanHoverUp: (up: boolean) => void;
  handCount: number;
  specFans: ReturnType<typeof spectatorFans>;
  players: SeatPlayers | null;
  boardSeat: Seat;
  spectating: boolean;
  prefs: DuelSettings;
  wide: boolean;
  railHand: boolean;
  setHandHidden: (hidden: boolean) => void;
  setHandPinned: (pinned: boolean) => void;
  toggleHandUp: () => void;
  dropHandClickFocus: React.MouseEventHandler<HTMLElement>;
  specGrip: (which: "near" | "far") => ReactNode;
  specHandToggle: (which: "near" | "far", count: number) => ReactNode;
  sortHandBtn: ReactNode;
  hideHandBtn: ReactNode;
  renderHandCards: (fanned?: boolean) => ReactNode;
}) {
  return (
    <>
      {fanHand ? (
        <>
        <HandFan
          rootRef={fanRef}
          cardsRef={handRowRef}
          spot={fanCorner ? "corner" : shownFanPos == null ? "center" : fanFloating ? "float" : "docked"}
          drawer={drawer}
          tucking={tuckUnderPointer}
          moving={fanMove.livePos != null}
          dragging={handTucked}
          hoverUp={fanHoverUp}
          onHoverUp={setFanHoverUp}
          count={handCount}
          cornerCut={fanCorner?.cut}
          pos={shownFanPos}
          ariaLabel={`${specFans ? `${seatLabel(players, boardSeat)} hand` : "Your hand"}: ${handCount} cards`}
          inert={handHidden && specFans == null}
          onClick={dropHandClickFocus}
          onLeave={() => setTuckUnderPointer(false)}
          head={
            specFans ? (
              <>
                {specGrip("near")}
                {specHandToggle("near", handCount)}
              </>
            ) : (
              <>
                {prefs.layoutGrips ? (
                  <button
                    type="button"
                    className="hand-fan-grip"
                    aria-label="Move your hand (drag, or arrow keys)"
                    title="Drag to move your hand anywhere"
                    {...fanMove.gripProps}
                  >
                    <span aria-hidden />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="hand-fan-toggle"
                  aria-expanded={handOpen}
                  title={
                    handHidden
                      ? "Show your hand (H)"
                      : handUp
                        ? prefs.keepHandOpen
                          ? "Let the hand tuck away"
                          : "Let the hand tuck away (H)"
                        : "Keep the hand up (H)"
                  }
                  onClick={() => {
                    if (handHidden) {
                      setHandHidden(false);
                      setHandPinned(true);
                      return;
                    }
                    toggleHandUp();
                  }}
                >
                  <span className="hand-fan-title">{spectating ? "Seat hand" : "Hand"}</span>
                  <span className="hand-rail-count">{handCount}</span>
                  <span className="hand-dock-caret" aria-hidden>
                    {handOpen ? "▾" : "▴"}
                  </span>
                </button>
                {!spectating ? sortHandBtn : null}
                {hideHandBtn}
              </>
            )
          }
        >
          {renderHandCards(true)}
        </HandFan>
        {/* After the fan, so its ref is set when the corner measures. */}
        {fanCorner ? <CornerFit fanRef={fanRef} column={fanCorner.column} /> : null}
        </>
      ) : wide && !railHand ? (
        <div
          className={`hand-dock${drawerClass}${handTucked ? " is-dragging" : ""}`}
          style={
            {
              "--n": Math.max(handCount, 1),
              "--n1": Math.max(handCount - 1, 1),
            } as CSSProperties
          }
          aria-label={`Your hand: ${handCount} cards`}
          onClick={dropHandClickFocus}
          onPointerLeave={() => setTuckUnderPointer(false)}
        >
          <div className="hand-dock-head">
            <button
              type="button"
              className="hand-dock-toggle"
              aria-expanded={handOpen}
              title={handHidden ? "Show your hand (H)" : handUp ? "Let the hand tuck away" : "Keep the hand open"}
              onClick={() => {
                if (handHidden) {
                  setHandHidden(false);
                  setHandPinned(true);
                  return;
                }
                toggleHandUp();
              }}
            >
              <span>{spectating ? "Seat hand" : "Hand"}</span>
              <span className="hand-rail-count">{handCount}</span>
              <span className="hand-dock-caret" aria-hidden>
                {handOpen ? "▾" : "▴"}
              </span>
            </button>
            {!spectating ? (
              sortHandBtn
            ) : null}
            {hideHandBtn}
          </div>
          <div className="hand-dock-cards" ref={handRowRef} inert={handHidden || undefined}>
            {renderHandCards()}
          </div>
        </div>
      ) : null}
    </>
  );
}

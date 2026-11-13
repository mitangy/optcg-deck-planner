import type { RefObject } from "react";
import type { Seat, SeatPlayers } from "../../net/protocol";
import { CardTile } from "../zones/CardTile";
import { HandFan } from "./HandFan";
import { fanPoseStyle } from "./handFanGeometry";
import { FAN_SNAP_PX, type parseFanPos } from "./handFanPos";
import { seatLabel } from "../match/playerNames";
import type { spectatorFans } from "./handLayout";
import type { useFanMove } from "./useFanMove";

/**
 * A spectator's far hand on a desktop board: the fan fixed to the top of the board column or floating where it
 * was dragged (outside the mat, which would clip it), and the target that lights while a fan is dragged home.
 */
export function SpectatorFanLayer({
  specFans,
  fanMove,
  farMove,
  playmatRef,
  farHand,
  farRef,
  shownFarPos,
  farUp,
  farTuckUnderPointer,
  farHoverUp,
  setFarHoverUp,
  setFarTuckUnderPointer,
  players,
  oppSeat,
  dropHandClickFocus,
  specGrip,
  specHandToggle,
}: {
  specFans: ReturnType<typeof spectatorFans>;
  fanMove: ReturnType<typeof useFanMove>;
  farMove: ReturnType<typeof useFanMove>;
  playmatRef: RefObject<HTMLDivElement | null>;
  farHand: readonly { id: string; defId: string; artCopy?: number }[] | undefined;
  farRef: RefObject<HTMLDivElement | null>;
  shownFarPos: ReturnType<typeof parseFanPos>;
  farUp: boolean;
  farTuckUnderPointer: boolean;
  farHoverUp: boolean;
  setFarHoverUp: (up: boolean) => void;
  setFarTuckUnderPointer: (under: boolean) => void;
  players: SeatPlayers | null;
  oppSeat: Seat;
  dropHandClickFocus: React.MouseEventHandler<HTMLElement>;
  specGrip: (which: "near" | "far") => React.ReactNode;
  specHandToggle: (which: "near" | "far", count: number) => React.ReactNode;
}) {
  return (
    <>
      {specFans === "desktop" && (fanMove.livePos != null || farMove.livePos != null)
        ? (() => {
            // Where the fan being dragged docks; lit when letting go now would put it back.
            const near = fanMove.livePos != null;
            const mat = playmatRef.current?.getBoundingClientRect();
            if (!mat) return null;
            return (
              <div
                className={`spec-dock-target spec-dock-target-${near ? "near" : "far"}${(near ? fanMove.willDock : farMove.willDock) ? " is-active" : ""}`}
                style={{
                  left: mat.left,
                  width: mat.width,
                  height: FAN_SNAP_PX,
                  ...(near ? { bottom: 0 } : { top: mat.top }),
                }}
                aria-hidden
              />
            );
          })()
        : null}

      {farHand && specFans === "desktop" ? (
        // Fixed to the top of the board column, or floating where it was dragged: outside the mat, which would clip it.
        <HandFan
          rootRef={farRef}
          edge="top"
          spot={shownFarPos ? "float" : "center"}
          drawer={farUp ? "open" : "tucked"}
          tucking={farTuckUnderPointer}
          moving={farMove.livePos != null}
          hoverUp={farHoverUp}
          onHoverUp={setFarHoverUp}
          count={farHand.length}
          pos={shownFarPos}
          ariaLabel={`${seatLabel(players, oppSeat)} hand: ${farHand.length} cards`}
          onClick={dropHandClickFocus}
          onLeave={() => setFarTuckUnderPointer(false)}
          head={
            <>
              {specGrip("far")}
              {specHandToggle("far", farHand.length)}
            </>
          }
        >
          {farHand.map((c, i) => (
            <CardTile
              key={c.id}
              defId={c.defId}
              artCopy={c.artCopy}
              ownerSeat={oppSeat}
              inspectOnClick
              style={fanPoseStyle(i, farHand.length)}
            />
          ))}
        </HandFan>
      ) : null}
    </>
  );
}

import type {
  ReactNode,
} from "react";
import type { Seat, SeatPlayers } from "../../net/protocol";
import type { DuelSettings } from "../../settings";
import { seatLabel } from "../match/playerNames";
import type { spectatorFans } from "./handLayout";
import type { useFanMove } from "./useFanMove";

export type SpecHandChromeCtx = {
  specFans: ReturnType<typeof spectatorFans>;
  prefs: DuelSettings;
  fanMove: ReturnType<typeof useFanMove>;
  farMove: ReturnType<typeof useFanMove>;
  players: SeatPlayers | null;
  boardSeat: Seat;
  oppSeat: Seat;
  handUp: boolean;
  farUp: boolean;
  handOpen: boolean;
  toggleHandUp: () => void;
  toggleFarUp: () => void;
};

// The drag grip on a spectator's hand fan (desktop only, when layout grips are on).
export function specGripFor(ctx: SpecHandChromeCtx, which: "near" | "far"): ReactNode {
  const { specFans, prefs, fanMove, farMove, players, boardSeat, oppSeat } = ctx;
    if (specFans !== "desktop" || !prefs.layoutGrips) return undefined;
    const move = which === "near" ? fanMove : farMove;
    const name = seatLabel(players, which === "near" ? boardSeat : oppSeat);
    return (
      <button
        type="button"
        className="hand-fan-grip"
        aria-label={`Move ${name} hand (drag, or arrow keys)`}
        title={`Drag to move ${name} hand anywhere`}
        {...move.gripProps}
      >
        <span aria-hidden />
      </button>
    );
  }

// The title/count/caret button that tucks or raises a spectator's hand fan.
export function specHandToggleFor(ctx: SpecHandChromeCtx, which: "near" | "far", count: number): ReactNode {
  const { handUp, farUp, handOpen, players, boardSeat, oppSeat, toggleHandUp, toggleFarUp } = ctx;
    const near = which === "near";
    const up = near ? handUp : farUp;
    return (
      <button
        type="button"
        className="hand-fan-toggle"
        aria-expanded={near ? handOpen : farUp}
        title={up ? "Let the hand tuck away" : "Keep the hand up"}
        onClick={near ? toggleHandUp : toggleFarUp}
      >
        <span className="hand-fan-title">{seatLabel(players, near ? boardSeat : oppSeat)} hand</span>
        <span className="hand-rail-count">{count}</span>
        <span className="hand-dock-caret" aria-hidden>
          {up ? "▾" : "▴"}
        </span>
      </button>
    );
  }

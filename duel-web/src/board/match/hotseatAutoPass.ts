import type { Seat } from "../../net/protocol";

export function applyHotseatAutoPass(args: {
  needed: Seat | null;
  activeSeat: Seat;
  lastNeeded: Seat | null;
  manualPass: boolean;
}): { activeSeat: Seat; lastNeeded: Seat | null; manualPass: boolean } {
  const { needed, activeSeat, lastNeeded, manualPass } = args;

  if (needed !== lastNeeded) {
    if (needed != null && needed !== activeSeat) {
      return { activeSeat: needed, lastNeeded: needed, manualPass: false };
    }
    return { activeSeat, lastNeeded: needed, manualPass: false };
  }

  // Pending / game-required seat overrides a stale manual Pass on the wrong seat.
  if (needed != null && needed !== activeSeat) {
    return { activeSeat: needed, lastNeeded: needed, manualPass: false };
  }

  if (manualPass) {
    return { activeSeat, lastNeeded, manualPass: true };
  }

  return { activeSeat, lastNeeded, manualPass: false };
}

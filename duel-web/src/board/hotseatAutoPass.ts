import type { Seat } from "../net/protocol";

/**
 * Apply hotseat auto-pass without clobbering a deliberate manual Pass during
 * the same game moment (e.g. turn player handing the device to the opponent).
 *
 * Exception: when `needed` is a different seat than the device holder (e.g.
 * Rocks When Attacking pending while the device is still on Teach after a
 * premature block handoff or manual Pass), force the handoff — pending-choice
 * ownership always wins over manualPass.
 */
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

import type { Seat } from "../net/protocol";

/**
 * Apply hotseat auto-pass without clobbering a deliberate manual Pass during
 * the same game moment (e.g. turn player handing the device to the opponent).
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

  if (manualPass) {
    return { activeSeat, lastNeeded, manualPass: true };
  }

  if (needed != null && needed !== activeSeat) {
    return { activeSeat: needed, lastNeeded, manualPass: false };
  }

  return { activeSeat, lastNeeded, manualPass: false };
}

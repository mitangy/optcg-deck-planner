import { useState } from "react";

/**
 * One hand fan's raise / tuck state. The board keeps two: the player's (or a spectator's near) hand and a
 * spectator's far hand.
 */
export function useFanState(initialPinned: boolean) {
  /** Raised by the player (pin), as the hand button shows it. */
  const [pinned, setPinned] = useState(initialPinned);
  /** A fan dragged off the bottom edge is fully shown unless tucked to its handle ("Let the hand tuck away"). */
  const [floatTucked, setFloatTucked] = useState(false);
  /**
   * Just tucked by its own button or H: the pointer is usually still on the
   * hand, so hover must not raise it again until the pointer has left it.
   */
  const [tuckUnderPointer, setTuckUnderPointer] = useState(false);
  /**
   * The pointer is on the fan's cards (not its handle row): a tucked fan rises
   * on this and stays up until the pointer leaves the whole fan, so moving
   * from the cards to the buttons doesn't drop it under the cursor (#780).
   */
  const [hoverUp, setHoverUp] = useState(false);
  return { pinned, setPinned, floatTucked, setFloatTucked, tuckUnderPointer, setTuckUnderPointer, hoverUp, setHoverUp };
}

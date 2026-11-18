import { useState } from "react";

export function useFanState(initialPinned: boolean) {
  const [pinned, setPinned] = useState(initialPinned);
  const [floatTucked, setFloatTucked] = useState(false);
  // Just tucked by its own button or H: the pointer is usually still on the hand, so hover must not raise it again until the pointer has left.
  const [tuckUnderPointer, setTuckUnderPointer] = useState(false);
  // A tucked fan rises on this and stays up until the pointer leaves the whole fan, so moving from the cards to the buttons doesn't drop it under the cursor.
  const [hoverUp, setHoverUp] = useState(false);
  return { pinned, setPinned, floatTucked, setFloatTucked, tuckUnderPointer, setTuckUnderPointer, hoverUp, setHoverUp };
}

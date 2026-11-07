import { useCallback, useEffect, useState } from "react";
import type { DuelSettings } from "../settings";
import {
  markRotateHintSeen,
  releaseOrientationLock,
  rotateHintSeen,
  shouldShowRotateHint,
  syncOrientationLock,
} from "./orientation";
import { useMediaQuery } from "./useMediaQuery";

/**
 * Screen orientation: the saved lock (re-applied once full screen is entered) and the one-time "rotate for
 * bigger cards" toast on a portrait phone. `blocked`: something else owns the screen right now (an attack
 * to answer, or the midline strip is taken).
 */
export function useOrientationHint({
  orientationPref,
  isFullscreen,
  boardReady,
  over,
  defendOpen,
  midlineTaken,
  hotseat,
}: {
  orientationPref: DuelSettings["screenOrientation"];
  isFullscreen: boolean;
  /** The match view has arrived. */
  boardReady: boolean;
  over: boolean;
  /** The defend tray / rail is up (`defend != null`). */
  defendOpen: boolean;
  /** The midline strip shows a sentence (`midlineText != null`). */
  midlineTaken: boolean;
  hotseat: boolean;
}) {
  // Screen orientation setting: lock where the browser allows it, and again
  // once full screen is entered (Android only allows a lock there).
  useEffect(() => {
    void syncOrientationLock(orientationPref);
  }, [orientationPref, isFullscreen]);
  useEffect(() => releaseOrientationLock, []);

  // One-time "rotate for bigger cards" toast on a portrait phone.
  const portraitViewport = useMediaQuery("(orientation: portrait)");
  const phoneViewport = useMediaQuery("(pointer: coarse) and (max-width: 599px)");
  const [rotateHintOpen, setRotateHintOpen] = useState(false);
  const rotateHintDue =
    boardReady &&
    !over &&
    // Wait out an attack: the toast would sit over your field mid-response.
    !defendOpen &&
    // The hint lives in the midline strip, so wait for it to be free.
    !midlineTaken &&
    shouldShowRotateHint({
      portrait: portraitViewport,
      phone: phoneViewport,
      setting: orientationPref,
      seen: rotateHintSeen(),
      hotseat,
    });
  useEffect(() => {
    if (rotateHintDue) {
      markRotateHintSeen();
      setRotateHintOpen(true);
    }
  }, [rotateHintDue]);
  // Turning the phone (or picking portrait) puts the hint away.
  const rotateHintShown =
    rotateHintOpen &&
    portraitViewport &&
    orientationPref !== "portrait" &&
    !defendOpen &&
    !midlineTaken;
  const closeRotateHint = useCallback(() => setRotateHintOpen(false), []);
  return { rotateHintShown, closeRotateHint };
}

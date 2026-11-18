import { useCallback, useEffect, useState } from "react";
import type { DuelSettings } from "../../settings";
import {
  markRotateHintSeen,
  releaseOrientationLock,
  rotateHintSeen,
  shouldShowRotateHint,
  syncOrientationLock,
} from "./orientation";
import { useMediaQuery } from "./useMediaQuery";

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
  boardReady: boolean;
  over: boolean;
  defendOpen: boolean;
  midlineTaken: boolean;
  hotseat: boolean;
}) {
  useEffect(() => {
    void syncOrientationLock(orientationPref);
  }, [orientationPref, isFullscreen]);
  useEffect(() => releaseOrientationLock, []);

  const portraitViewport = useMediaQuery("(orientation: portrait)");
  const phoneViewport = useMediaQuery("(pointer: coarse) and (max-width: 599px)");
  const [rotateHintOpen, setRotateHintOpen] = useState(false);
  const rotateHintDue =
    boardReady &&
    !over &&
    !defendOpen &&
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
  const rotateHintShown =
    rotateHintOpen &&
    portraitViewport &&
    orientationPref !== "portrait" &&
    !defendOpen &&
    !midlineTaken;
  const closeRotateHint = useCallback(() => setRotateHintOpen(false), []);
  return { rotateHintShown, closeRotateHint };
}

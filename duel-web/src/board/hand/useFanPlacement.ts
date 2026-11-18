import { useMemo, useRef, type RefObject } from "react";
import type { DuelSettings } from "../../settings";
import { updateSettings } from "../../settings";
import { fanDocked, farFanPosForDrop, parseFanPos, serializeFanPos, spectatorNearFanPosForDrop } from "./handFanPos";
import type { spectatorFans } from "./handLayout";
import { useFanMove } from "./useFanMove";
import { useFanState } from "./useFanState";

// Where the hand fan sits (docked, centred or dragged anywhere) and the second fan a desktop spectator sees.
export function useFanPlacement({
  prefs,
  specFans,
  fanHand,
  playmatRef,
  floatTucked,
  handPinned,
}: {
  prefs: DuelSettings;
  specFans: ReturnType<typeof spectatorFans>;
  fanHand: boolean;
  playmatRef: RefObject<HTMLDivElement | null>;
  floatTucked: boolean;
  handPinned: boolean;
}) {
  const fanPos = useMemo(() => parseFanPos(prefs.handFanPos), [prefs.handFanPos]);
  const specNearPos = useMemo(() => parseFanPos(prefs.spectatorNearFanPos), [prefs.spectatorNearFanPos]);
  const specFarPos = useMemo(() => parseFanPos(prefs.spectatorFarFanPos), [prefs.spectatorFarFanPos]);
  const fanRef = useRef<HTMLDivElement | null>(null);
  const farRef = useRef<HTMLDivElement | null>(null);
  const boardCentreX = () => {
    const r = playmatRef.current?.getBoundingClientRect();
    return r ? r.left + r.width / 2 : window.innerWidth / 2;
  };
  const fanMove = useFanMove(
    fanRef,
    specFans ? specNearPos : fanPos,
    (next) =>
      updateSettings(
        specFans ? { spectatorNearFanPos: serializeFanPos(next) } : { handFanPos: serializeFanPos(next) },
      ),
    boardCentreX,
    specFans ? (centreX, bottom, _h, vp) => spectatorNearFanPosForDrop(centreX, bottom, vp) : undefined,
    specFans ? { bodySelector: ".hand-fan-cards", anchorGrip: true } : undefined,
  );
  const farMove = useFanMove(
    farRef,
    specFarPos,
    (next) => updateSettings({ spectatorFarFanPos: serializeFanPos(next) }),
    boardCentreX,
    (centreX, bottom, height, vp) => {
      const mat = playmatRef.current?.getBoundingClientRect();
      return farFanPosForDrop(centreX, bottom, height, vp, mat?.top ?? 0);
    },
    { bodySelector: ".hand-fan-cards", anchorGrip: true },
  );
  const shownFanPos = fanMove.livePos ?? (specFans ? specNearPos : fanPos);
  const shownFarPos = specFans === "desktop" ? (farMove.livePos ?? specFarPos) : null;
  const fanFloating = fanHand && shownFanPos != null && (fanMove.livePos != null || !fanDocked(shownFanPos));
  const handUp = fanFloating ? !floatTucked : handPinned;
  const {
    pinned: farPinned,
    setPinned: setFarPinned,
    floatTucked: farFloatTucked,
    setFloatTucked: setFarFloatTucked,
    tuckUnderPointer: farTuckUnderPointer,
    setTuckUnderPointer: setFarTuckUnderPointer,
    hoverUp: farHoverUp,
    setHoverUp: setFarHoverUp,
  } = useFanState(false);
  const farUp = shownFarPos ? !farFloatTucked : farPinned;
  const farTop = shownFarPos == null;
  const fanCenter = fanHand && shownFanPos == null;
  return {
    fanRef,
    farRef,
    fanMove,
    farMove,
    shownFanPos,
    shownFarPos,
    fanFloating,
    handUp,
    setFarPinned,
    setFarFloatTucked,
    farTuckUnderPointer,
    setFarTuckUnderPointer,
    farHoverUp,
    setFarHoverUp,
    farUp,
    farTop,
    fanCenter,
  };
}

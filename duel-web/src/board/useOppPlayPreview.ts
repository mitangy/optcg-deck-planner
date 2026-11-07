import { useEffect, useRef } from "react";
import type { PlayerView, Seat } from "../net/protocol";
import type { BattleLogEntry } from "./battleLog";
import { getLastHoverAt, getPreviewCard, setAutoPreviewCard, shouldAutoPreview } from "./cardPreview";
import { latestOpponentPlay, opponentPlayCaption } from "./opponentPlay";

/**
 * Desktop: the big preview follows the opponent's latest play, so one you
 * looked away from is still readable. Hovering a card wins for a moment.
 * Returns the opponent's seat (the board's other seat).
 */
export function useOppPlayPreview({
  battleLog,
  seat,
  view,
  wide,
  lp,
}: {
  battleLog: BattleLogEntry[];
  seat: Seat | null;
  view: PlayerView | null;
  wide: boolean;
  lp: boolean;
}): 0 | 1 {
  const previewOppSeat: 0 | 1 = (seat ?? view?.seat ?? 0) === 0 ? 1 : 0;
  const oppPlay = wide && !lp ? latestOpponentPlay(battleLog, previewOppSeat) : null;
  const oppPlayId = oppPlay?.entryId ?? null;
  const seenOppPlayId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const prev = seenOppPlayId.current;
    seenOppPlayId.current = oppPlayId;
    if (!oppPlay || oppPlayId === prev) return;
    const auto = {
      defId: oppPlay.defId,
      ownerSeat: previewOppSeat,
      caption: opponentPlayCaption(oppPlay),
    };
    if (prev === undefined) {
      // First mount: only fill an empty panel.
      if (!getPreviewCard()) setAutoPreviewCard(auto);
      return;
    }
    // A log replaced wholesale (resync / undo) is not a new play.
    if (prev !== null && !battleLog.some((e) => e.id === prev)) return;
    if (shouldAutoPreview(Date.now(), getLastHoverAt())) setAutoPreviewCard(auto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oppPlayId]);
  return previewOppSeat;
}

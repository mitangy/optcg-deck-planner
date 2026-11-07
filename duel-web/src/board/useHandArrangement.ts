import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlayerView } from "../net/protocol";
import type { DuelSettings } from "../settings";
import { lookupCard } from "../cards/atlas";
import { moveToSlot, reconcileHandOrder } from "./handOrder";
import { useHandOrderSync } from "./handOrderSync";
import { sortHandIndices } from "./handSort";
import { useHandLift } from "./useHandLift";
import { useHandReorder } from "./useHandReorder";
import { useHandShuffle } from "./useHandShuffle";

/**
 * How your hand is arranged: sorted by cost or in your own dragged order, the card being lifted out of the hand
 * while dragged, the hand-shuffle sound / motion, and the order told to the room for spectators' fans.
 */
export function useHandArrangement({
  prefs,
  view,
  spectating,
  fanFloating,
  onHandOrder,
}: {
  prefs: DuelSettings;
  view: PlayerView | null;
  spectating: boolean;
  /** A floating fan steps aside once a dragged card leaves it (board drops under it). */
  fanFloating: boolean;
  onHandOrder: ((ids: string[]) => void) | undefined;
}) {
  const [handSorted, setHandSorted] = useState(prefs.sortHandByCost);
  /** Your own hand order (instance ids) from dragging cards around while unsorted. */
  const [handOrderIds, setHandOrderIds] = useState<readonly string[]>([]);
  /** The hand's display order right now, for a reorder dropped mid-render. */
  const handShownIdsRef = useRef<readonly string[]>([]);
  const captureHandShuffle = useHandShuffle(handShownIdsRef, { sound: prefs.turnSound });
  const onHandReorder = useCallback(
    (cardId: string, slot: number, x: number, y: number) => {
      captureHandShuffle("drop", { cardId, x, y });
      setHandOrderIds(moveToSlot(handShownIdsRef.current, cardId, slot));
    },
    [captureHandShuffle],
  );
  // A floating fan steps aside once a dragged card leaves it (board drops under it).
  const handReorder = useHandReorder(onHandReorder, { oneWayOut: fanFloating });
  /** Hand card (instance id) being dragged: it lifts out of the hand and follows the pointer. */
  const [liftedHandId, setLiftedHandId] = useState<string | null>(null);
  useHandLift(liftedHandId);
  function toggleHandSort() {
    captureHandShuffle("sort");
    setHandSorted((v) => !v);
  }
  useEffect(() => setHandSorted(prefs.sortHandByCost), [prefs.sortHandByCost]);

  const handDisplayIndices = useMemo(() => {
    if (!view || spectating) return null;
    const hand = view.you.hand;
    if (handSorted) return sortHandIndices(hand, (defId) => lookupCard(defId).cost);
    const at = new Map(hand.map((c, i) => [c.id, i]));
    return reconcileHandOrder(
      handOrderIds,
      hand.map((c) => c.id),
    ).map((id) => at.get(id)!);
  }, [view, spectating, handSorted, handOrderIds]);
  handShownIdsRef.current = (handDisplayIndices ?? []).map((i) => view?.you.hand[i]?.id ?? "");
  // Online players tell the room their hand order, so spectators' fans match it.
  useHandOrderSync(onHandOrder && !spectating && view ? handShownIdsRef.current : null, onHandOrder);

  return { handSorted, setHandSorted, toggleHandSort, handDisplayIndices, handReorder, liftedHandId, setLiftedHandId };
}

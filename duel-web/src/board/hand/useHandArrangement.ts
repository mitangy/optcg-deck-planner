import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlayerView } from "../../net/protocol";
import type { DuelSettings } from "../../settings";
import { lookupCard } from "../../cards/atlas";
import { moveToSlot, reconcileHandOrder } from "./handOrder";
import { useHandOrderSync } from "./handOrderSync";
import { sortHandIndices } from "./handSort";
import { useHandLift } from "./useHandLift";
import { useHandReorder } from "./useHandReorder";
import { useHandShuffle } from "./useHandShuffle";

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
  fanFloating: boolean;
  onHandOrder: ((ids: string[]) => void) | undefined;
}) {
  const [handSorted, setHandSorted] = useState(prefs.sortHandByCost);
  const [handOrderIds, setHandOrderIds] = useState<readonly string[]>([]);
  const handShownIdsRef = useRef<readonly string[]>([]);
  const captureHandShuffle = useHandShuffle(handShownIdsRef, { sound: prefs.turnSound });
  const onHandReorder = useCallback(
    (cardId: string, slot: number, x: number, y: number) => {
      captureHandShuffle("drop", { cardId, x, y });
      setHandOrderIds(moveToSlot(handShownIdsRef.current, cardId, slot));
    },
    [captureHandShuffle],
  );
  const handReorder = useHandReorder(onHandReorder, { oneWayOut: fanFloating });
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
  useHandOrderSync(onHandOrder && !spectating && view ? handShownIdsRef.current : null, onHandOrder);

  return { handSorted, setHandSorted, toggleHandSort, handDisplayIndices, handReorder, liftedHandId, setLiftedHandId };
}

import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { friendsApi, type MySpareItem, type TradeSide } from "./friendsApi";
import { useSavedShoppingDeckIds } from "../pages/shopping/shoppingDeckFilter";
import { capOf, type CardCap, type TrayLine } from "./tradeLogic";
import { qk } from "../cache/queryKeys";

export { capOf };

export function useFriendSpares(friendId: number, enabled = true) {
  const deckIds = useSavedShoppingDeckIds();
  const query = useQuery({
    queryKey: qk.friend.spares(friendId, deckIds),
    queryFn: () => friendsApi.spares(friendId, deckIds),
    enabled,
  });
  // Any of my own spares can go on the give side, not only those on their Shopping list.
  const mine = useQuery({ queryKey: qk.mySpares(), queryFn: friendsApi.mySpares, enabled });
  const otherMine = useMemo<MySpareItem[]>(() => {
    const needed = new Set((query.data?.they_need ?? []).map((i) => i.card_id));
    return (mine.data?.items ?? []).filter((i) => i.spare > 0 && !needed.has(i.card_id));
  }, [mine.data, query.data]);
  const caps = useMemo(() => {
    const map = new Map<string, CardCap>();
    for (const i of query.data?.their_spares ?? []) map.set(`get:${i.card_id}`, capOf(i));
    for (const i of query.data?.you_need ?? []) map.set(`get:${i.card_id}`, capOf(i));
    for (const i of otherMine) map.set(`give:${i.card_id}`, capOf(i));
    for (const i of query.data?.they_need ?? []) map.set(`give:${i.card_id}`, capOf(i));
    return map;
  }, [query.data, otherMine]);
  const capFor = useCallback(
    (side: TradeSide, cardId: string, lines: TrayLine[]): CardCap => {
      const known = caps.get(`${side}:${cardId}`);
      if (known) return known;
      const taken = lines.filter((l) => l.side === side && l.cardId === cardId);
      return {
        spare: taken.reduce((n, l) => n + l.qty, 0),
        base: taken.filter((l) => l.productId == null).reduce((n, l) => n + l.qty, 0),
        printings: Object.fromEntries(taken.filter((l) => l.productId != null).map((l) => [l.productId as number, l.qty])),
      };
    },
    [caps],
  );
  return { ...query, capFor, capOf, otherMine, mineLoading: mine.isLoading };
}

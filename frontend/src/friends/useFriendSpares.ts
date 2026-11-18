import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { friendsApi, type SpareItem, type TradeSide } from "./friendsApi";
import { useSavedShoppingDeckIds } from "../pages/shopping/shoppingDeckFilter";
import type { CardCap, TrayLine } from "./tradeLogic";
import { qk } from "../cache/queryKeys";

const capOf = (item: SpareItem): CardCap => ({ spare: item.spare, base: item.base_owned, printings: Object.fromEntries(item.printings.map((p) => [p.product_id, p.owned])) });

export function useFriendSpares(friendId: number) {
  const deckIds = useSavedShoppingDeckIds();
  const query = useQuery({
    queryKey: qk.friend.spares(friendId, deckIds),
    queryFn: () => friendsApi.spares(friendId, deckIds),
  });
  const caps = useMemo(() => {
    const map = new Map<string, CardCap>();
    for (const i of query.data?.their_spares ?? []) map.set(`get:${i.card_id}`, capOf(i));
    for (const i of query.data?.you_need ?? []) map.set(`get:${i.card_id}`, capOf(i));
    for (const i of query.data?.they_need ?? []) map.set(`give:${i.card_id}`, capOf(i));
    return map;
  }, [query.data]);
  const capFor = useCallback(
    (side: TradeSide, cardId: string, lines: TrayLine[]): CardCap => {
      const known = caps.get(`${side}:${cardId}`);
      if (known) return known;
      const mine = lines.filter((l) => l.side === side && l.cardId === cardId);
      return {
        spare: mine.reduce((n, l) => n + l.qty, 0),
        base: mine.filter((l) => l.productId == null).reduce((n, l) => n + l.qty, 0),
        printings: Object.fromEntries(mine.filter((l) => l.productId != null).map((l) => [l.productId as number, l.qty])),
      };
    },
    [caps],
  );
  return { ...query, capFor, capOf };
}

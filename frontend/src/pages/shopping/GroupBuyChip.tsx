import { Link } from "react-router-dom";
import type { ShoppingItem } from "../../api";
import { itemNeedsCopies } from "../collection/collectorLines";
import { toBuyText, totalOwned } from "../collection/OwnedCells";

/** Copies still on their way from a locked or ordered group buy (#1418); they no longer count as Still need. */
export function groupBuyChipText(item: Pick<ShoppingItem, "in_group_buy" | "group_buys">): string | null {
  const qty = item.in_group_buy ?? 0;
  const buys = item.group_buys ?? [];
  if (qty <= 0 || buys.length === 0) return null;
  return `${buys.some((b) => b.ordered) ? "On the way" : "In group buy"} · ${qty}`;
}

/** "Only cards I still need" keeps a card whose copies are all in a group buy, so its chip stays findable. */
export function shownWhileOnlyNeed(item: Parameters<typeof itemNeedsCopies>[0] & Pick<ShoppingItem, "in_group_buy">): boolean {
  return itemNeedsCopies(item) || (item.in_group_buy ?? 0) > 0;
}

export function GroupBuyChip({ item }: { item: Pick<ShoppingItem, "in_group_buy" | "group_buys"> }) {
  const text = groupBuyChipText(item);
  const buys = item.group_buys ?? [];
  if (!text) return null;
  return (
    <Link
      className="gb-transit-chip"
      to={`/group-buys/${buys[0].group_buy_id}`}
      title={buys.map((b) => `${b.title}: ${b.qty}`).join(", ")}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {text}
    </Link>
  );
}

type StatusItem = Pick<ShoppingItem, "need" | "owned" | "still_need" | "alts_owned" | "in_group_buy" | "group_buys">;

/** Row status: group buy copies are not in hand, so they never read as "Have all". */
export function shoppingStatusText(item: StatusItem): string {
  const onWay = item.in_group_buy ?? 0;
  if (onWay <= 0) return toBuyText(item.still_need, item.need);
  const word = (item.group_buys ?? []).some((b) => b.ordered) ? "on the way" : "in group buy";
  if (item.still_need > 0) return `${toBuyText(item.still_need, item.need)} · ${onWay} ${word}`;
  const have = Math.min(item.need, totalOwned(item.owned, item.alts_owned));
  const coming = Math.min(onWay, Math.max(0, item.need - have));
  return have > 0 ? `Have ${have} · ${coming} ${word}` : `${coming} ${word}`;
}

/** Green only when owned copies alone cover the need; covered by a group buy gets its own look. */
export function shoppingRowState(item: Pick<ShoppingItem, "still_need" | "in_group_buy">): "need" | "covered" | "done" {
  if (item.still_need > 0) return "need";
  return (item.in_group_buy ?? 0) > 0 ? "covered" : "done";
}

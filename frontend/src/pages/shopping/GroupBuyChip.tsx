import { Link } from "react-router-dom";
import type { ShoppingItem } from "../../api";
import { itemNeedsCopies } from "../collection/collectorLines";

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

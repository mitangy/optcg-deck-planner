import { GroupBuyLine, GroupBuyMember, GroupBuyMemberQty } from "../../api";
import { MemberSwatch, memberColorIndex } from "./memberColors";

export function cardShellClass(
  base: string,
  line: GroupBuyLine,
  members: GroupBuyMember[],
  excluded: boolean,
): string {
  const active = line.members.filter((m) => m.qty > 0);
  const sole =
    active.length === 1 ? ` gb-user-${memberColorIndex(active[0].user_id, members)}` : "";
  return `${base}${excluded ? " excluded" : ""}${sole}`;
}

/** Earliest member (member-list order) who still wants copies of this card. */
function primaryWantingMember(
  line: GroupBuyLine,
  members: GroupBuyMember[],
): GroupBuyMemberQty | null {
  const active = line.members.filter((m) => m.qty > 0);
  if (!active.length) return null;
  const order = new Map(members.map((m, i) => [m.user_id, i]));
  return [...active].sort(
    (a, b) => (order.get(a.user_id) ?? 999) - (order.get(b.user_id) ?? 999),
  )[0];
}

export function userSortKeyForLine(line: GroupBuyLine, members: GroupBuyMember[]): string {
  const primary = primaryWantingMember(line, members);
  if (!primary) return "zzzz";
  const idx = members.findIndex((m) => m.user_id === primary.user_id);
  const rank = String(idx >= 0 ? idx : 999).padStart(3, "0");
  return `${rank}-${primary.display_name.toLowerCase()}`;
}

export type GroupBuyDisplayRow =
  | { kind: "header"; key: string; userId: number; displayName: string }
  | { kind: "line"; key: string; line: GroupBuyLine };

export function groupBuyLineValue(line: GroupBuyLine, key: string) {
  switch (key) {
    case "card":
      return line.card_id;
    case "mine":
      return line.my_qty;
    case "total":
      return line.total_qty;
    case "who":
      return line.members.map((m) => m.display_name).join(", ");
    case "market":
      return line.market_price;
    case "est":
      return line.remaining_cost;
    default:
      return null;
  }
}

export function groupBuyOweValue(m: GroupBuyMember, key: string) {
  switch (key) {
    case "member":
      return m.display_name;
    case "cards":
      return m.card_cost ?? 0;
    case "shipping":
      return m.shipping_share ?? 0;
    case "tax":
      return m.tax_share ?? 0;
    case "owes":
      return m.total_owed ?? 0;
    default:
      return null;
  }
}

export function buildGroupBuyDisplayRows(
  lines: GroupBuyLine[],
  members: GroupBuyMember[],
  groupingByUser: boolean,
): GroupBuyDisplayRow[] {
  if (!groupingByUser) {
    return lines.map((line) => ({ kind: "line" as const, key: line.card_id, line }));
  }
  const rows: GroupBuyDisplayRow[] = [];
  let lastUserId: number | undefined;
  for (const line of lines) {
    const primary = primaryWantingMember(line, members);
    const userId = primary?.user_id ?? -1;
    if (userId !== lastUserId) {
      rows.push({
        kind: "header",
        key: `user-${userId}`,
        userId,
        displayName: primary?.display_name ?? "No buyers",
      });
      lastUserId = userId;
    }
    rows.push({ kind: "line", key: line.card_id, line });
  }
  return rows;
}

export function UserGroupHeading({
  userId,
  displayName,
  members,
}: {
  userId: number;
  displayName: string;
  members: GroupBuyMember[];
}) {
  return (
    <div className="group-buy-user-heading">
      {userId >= 0 ? <MemberSwatch userId={userId} members={members} title={displayName} /> : null}
      <span>{displayName}</span>
    </div>
  );
}

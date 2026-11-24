import { money, type GroupBuyLine, type GroupBuyMember } from "../../api";
import { normalizeStatus } from "./groupBuyActions";

/** Members the host typed in for people who are not on the app (#1445). */
export function offlineMembers<M extends Pick<GroupBuyMember, "is_offline">>(members: M[]): M[] {
  return members.filter((m) => m.is_offline);
}

/** Only the host adds, renames, removes or buys for these members, and only while quantities can still change. */
export function canManageOffline(d: { is_host: boolean; status: string }): boolean {
  return d.is_host && normalizeStatus(d.status) === "open";
}

/** The offline member the host picked under "Buying for", or null (You) when none is picked or they were removed. */
export function resolveBuyingFor(members: GroupBuyMember[], pickedId: number | null): GroupBuyMember | null {
  if (pickedId == null) return null;
  return members.find((m) => m.user_id === pickedId && m.is_offline) ?? null;
}

/** How many copies of the card one member is buying. */
export function buyingForQty(line: Pick<GroupBuyLine, "members">, userId: number): number {
  return line.members.find((m) => m.user_id === userId)?.qty ?? 0;
}

/** The line under a Paste their list result: what was set and what could not be read. */
export function pasteSummary(res: { applied: number; unmatched: string[] }, name: string): string {
  const set = `${res.applied} ${res.applied === 1 ? "card" : "cards"} set for ${name}`;
  const n = res.unmatched.length;
  return n === 0 ? `${set}.` : `${set}. ${n} ${n === 1 ? "line was" : "lines were"} not recognised.`;
}

/** The host adds or renames people who are not on the app until the group buy is completed (#1451). */
export function canAddOffline(d: { is_host: boolean; status: string }): boolean {
  return d.is_host && normalizeStatus(d.status) !== "completed";
}

/** Once locked or ordered, someone with copies cannot be removed: move their copies off first (#1451). */
export function canRemoveOffline(d: { is_host: boolean; status: string }, m: Pick<GroupBuyMember, "cards_still_needed">): boolean {
  return canAddOffline(d) && (normalizeStatus(d.status) === "open" || m.cards_still_needed === 0);
}

/** Host only, while locked or ordered, and only when somebody is not on the app to move copies to or from (#1451). */
export function canMoveCopies(d: { is_host: boolean; status: string; members: Pick<GroupBuyMember, "is_offline">[] }): boolean {
  const status = normalizeStatus(d.status);
  return d.is_host && (status === "locked" || status === "ordered") && d.members.some((m) => m.is_offline);
}

export type MoveArt = { product_id: number | null; qty: number };

/** The arts one member has copies of on this card, standard art first; the most they can move of each. */
export function moveArtChoices(line: Pick<GroupBuyLine, "member_arts">, userId: number): MoveArt[] {
  return (line.member_arts ?? [])
    .filter((r) => r.user_id === userId && r.qty > 0)
    .map((r) => ({ product_id: r.product_id, qty: r.qty }))
    .sort((a, b) => (a.product_id ?? 0) - (b.product_id ?? 0));
}

/** What one copy of this art costs in this group buy: what was paid when it was bought, else its market price. */
export function moveUnitPrice(
  line: Pick<GroupBuyLine, "bought_arts" | "alt_arts" | "preferred_market_price" | "market_price">,
  art: number | null,
): number | null {
  const bought = line.bought_arts?.find((b) => b.product_id === art);
  if (bought) return bought.unit_price;
  if (art == null) return line.preferred_market_price ?? line.market_price;
  return line.alt_arts?.find((a) => a.product_id === art)?.market_price ?? null;
}

/** "Moves 2 copies and $5.00 from Mikosaur to Sam", or without the money when the art has no price. */
export function movePreview(qty: number, unitPrice: number | null, from: string, to: string): string {
  const copies = `${qty} ${qty === 1 ? "copy" : "copies"}`;
  const what = unitPrice == null ? copies : `${copies} and ${money(Math.round(qty * unitPrice * 100) / 100)}`;
  return `Moves ${what} from ${from} to ${to}`;
}

/** Whether anybody has copies of this card the host can move (the server only sends this to the host). */
export function hasMovableCopies(line: Pick<GroupBuyLine, "member_arts">): boolean {
  return (line.member_arts ?? []).some((r) => r.qty > 0);
}

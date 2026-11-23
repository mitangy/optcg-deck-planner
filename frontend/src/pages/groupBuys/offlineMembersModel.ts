import type { GroupBuyLine, GroupBuyMember } from "../../api";
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

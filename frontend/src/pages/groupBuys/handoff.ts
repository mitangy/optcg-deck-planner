import type { GroupBuyMember } from "../../api";
import type { ChipTone } from "./groupBuyOrders";

export type HandoffStatus = "waiting" | "shipped" | "handed_over" | "received";

/** One word per state, never colour alone: the chip adds an icon in StatusChip. */
export function handoffChip(status: string): { label: string; tone: ChipTone } {
  switch (status) {
    case "shipped":
      return { label: "Shipped", tone: "way" };
    case "handed_over":
      return { label: "Handed over", tone: "mixed" };
    case "received":
      return { label: "Received", tone: "done" };
    default:
      return { label: "Waiting", tone: "none" };
  }
}

/** The host row's count line: "3 cards ready · 2 handed over". */
export function handoffCounts(m: Pick<GroupBuyMember, "ready_to_hand_over" | "qty_handed">): string {
  const ready = m.ready_to_hand_over ?? 0;
  const handed = m.qty_handed ?? 0;
  return `${ready} ${ready === 1 ? "card" : "cards"} ready · ${handed} handed over`;
}

/** What the member reads in Your cards, or null when there is nothing to say yet. */
export function myHandoffText(m: Pick<GroupBuyMember, "handoff_status" | "ready_to_hand_over" | "qty_handed">): string | null {
  const ready = m.ready_to_hand_over ?? 0;
  switch (m.handoff_status) {
    case "shipped":
      return "Shipped";
    case "handed_over":
      return "Handed over";
    case "received":
      return ready > 0 ? `Ready for pickup: ${ready} ${ready === 1 ? "card" : "cards"}` : "Received";
    default:
      return ready > 0 ? `Ready for pickup: ${ready} ${ready === 1 ? "card" : "cards"}` : null;
  }
}

/** The member can confirm only what the host marked as sent. */
export function canConfirmReceived(status: string | undefined): boolean {
  return status === "shipped" || status === "handed_over";
}

/** Members the host hands cards to: everyone but the host, who already holds theirs. */
export function handoffMembers(members: GroupBuyMember[]): GroupBuyMember[] {
  return members.filter((m) => m.role !== "host");
}

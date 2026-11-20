export type GroupBuyStatus = "open" | "locked" | "ordered" | "completed";

export type GroupBuyActionKey =
  | "lock"
  | "mark-ordered"
  | "import-receipt"
  | "mark-purchased"
  | "copy-invite"
  | "mass-entry"
  | "reset-invite"
  | "unlock"
  | "undo-purchase"
  | "delete"
  | "leave";

export type GroupBuyActions = {
  /** The one button that moves the group buy to its next step (hosts only). */
  primary: GroupBuyActionKey | null;
  secondary: GroupBuyActionKey[];
  /** Rare actions, behind the More menu. */
  more: GroupBuyActionKey[];
};

export function normalizeStatus(status: string): GroupBuyStatus {
  return status === "locked" || status === "ordered" || status === "completed" ? status : "open";
}

/** What the header offers for each step and role: one primary button, a few secondary ones, the rest under More. */
export function groupBuyActions(statusRaw: string, isHost: boolean, receiptReady: boolean, canUndo: boolean): GroupBuyActions {
  const status = normalizeStatus(statusRaw);
  if (!isHost) {
    return {
      primary: null,
      secondary: status === "open" ? ["copy-invite", "mass-entry"] : status === "completed" ? [] : ["mass-entry"],
      more: ["leave"],
    };
  }
  switch (status) {
    case "open":
      return { primary: "lock", secondary: ["copy-invite", "mass-entry"], more: ["reset-invite", "delete"] };
    case "locked":
      return { primary: "mark-ordered", secondary: ["mass-entry"], more: ["unlock", "delete"] };
    case "ordered":
      return { primary: receiptReady ? "mark-purchased" : "import-receipt", secondary: ["mass-entry"], more: canUndo ? ["undo-purchase", "delete"] : ["delete"] };
    case "completed":
      return { primary: null, secondary: [], more: canUndo ? ["undo-purchase", "delete"] : ["delete"] };
  }
}

export const GROUP_BUY_STEPS: { status: GroupBuyStatus; label: string }[] = [
  { status: "open", label: "Open" },
  { status: "locked", label: "Locked" },
  { status: "ordered", label: "Ordered" },
  { status: "completed", label: "Purchased" },
];

export function stepLabel(status: string): string {
  return GROUP_BUY_STEPS.find((s) => s.status === normalizeStatus(status))!.label;
}

/** The one short line under the stepper, for the current step. */
export function stepHint(statusRaw: string, isHost: boolean, receiptReady: boolean, hasReceipt: boolean): string {
  const status = normalizeStatus(statusRaw);
  if (status === "open") {
    return isHost
      ? "Everyone edits Your buy on the cards below. Lock when the list is final."
      : "Edit Your buy on any card before the host locks.";
  }
  if (status === "locked") {
    return isHost
      ? "Quantities are frozen. Place the TCGPlayer order, then mark it ordered."
      : "Quantities are frozen while the host checks out.";
  }
  if (status === "ordered") {
    if (!isHost) return "Order placed. The host marks it purchased once the receipt is matched.";
    if (receiptReady) return "Receipt matched. Mark purchased adds the matched copies to Owned.";
    return hasReceipt
      ? "Matching the saved receipt. Mark purchased unlocks when the match finishes."
      : "Import and match a TCGPlayer receipt to enable Mark purchased.";
  }
  return "Purchased. Owned is updated for the matched receipt cards.";
}

export function stepIndex(status: string): number {
  return GROUP_BUY_STEPS.findIndex((s) => s.status === normalizeStatus(status));
}

/** Summary line under the title: money is labelled, and the grand total appears once the order is locked. */
export function summaryParts(d: {
  status: string;
  host_name: string;
  member_count: number;
  unique_cards: number;
  cards_still_needed: number;
  remaining_market: number;
  grand_total: number;
}): { text: string; moneyLabel: string; money: number } {
  const open = normalizeStatus(d.status) === "open";
  return {
    text: `Host ${d.host_name} · ${d.member_count} ${d.member_count === 1 ? "member" : "members"} · ${d.unique_cards} cards · ${d.cards_still_needed} copies`,
    moneyLabel: open ? "Cards" : "Total",
    money: open ? d.remaining_market : d.grand_total,
  };
}

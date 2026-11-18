import { money, type GroupBuyMember } from "../../api";
import { normalizeStatus } from "./groupBuyActions";

export type YourShare = {
  /** Bold lead, e.g. "51 copies" or "$231.12". */
  headline: { before: string; strong: string; after?: string; afterStrong?: string };
  /** Small breakdown under an owed total, e.g. "cards $200 · ship $20 · tax $11.12". */
  detail: string | null;
};

/** The signed-in member's own line in the Your share card: what they buy while open, what they owe after. */
export function yourShare(statusRaw: string, m: GroupBuyMember): YourShare {
  const cards = m.card_cost ?? m.remaining_market;
  if (normalizeStatus(statusRaw) === "open") {
    const n = m.cards_still_needed;
    return {
      headline: { before: "You're buying ", strong: `${n} ${n === 1 ? "copy" : "copies"}`, after: " · Cards ", afterStrong: money(cards) },
      detail: null,
    };
  }
  return {
    headline: { before: "You owe ", strong: money(m.total_owed ?? cards) },
    detail: `cards ${money(cards)} · ship ${money(m.shipping_share ?? 0)} · tax ${money(m.tax_share ?? 0)}`,
  };
}

/** Plain text of the headline, for tests and aria labels. */
export function yourShareText(statusRaw: string, m: GroupBuyMember): string {
  const { headline: h } = yourShare(statusRaw, m);
  return `${h.before}${h.strong}${h.after ?? ""}${h.afterStrong ?? ""}`;
}

/** "Xebec, Luffy 079" or "All decks" for the decks a member is buying for, then the extra pools. */
export function buyingForText(
  deckNames: { id: number; name: string }[],
  activeDeckIds: number[] | null | undefined,
  includeSingles: boolean,
  includeExtraCopies: boolean,
): string {
  const all = !activeDeckIds || (deckNames.length > 0 && activeDeckIds.length === deckNames.length);
  const picked = all ? [] : deckNames.filter((d) => activeDeckIds!.includes(d.id)).map((d) => d.name);
  const parts: string[] = [all ? "All decks" : picked.length ? picked.join(", ") : "No decks"];
  if (includeSingles) parts.push("Cards not in a deck");
  if (includeExtraCopies) parts.push("Extra copies");
  return parts.join(" · ");
}

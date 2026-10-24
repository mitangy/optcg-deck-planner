/** Pure trade helpers: the tray (what you are about to offer), caps against spares, and which side is "mine" (#703). */
import type { Trade, TradeLine, TradeLineIn, TradeSide, TradesSummary } from "./friendsApi";

/** The API takes 1..20 copies per line and 1..40 lines per offer. */
export const MAX_LINE_QTY = 20;
export const MAX_LINES = 40;

export type TrayLine = {
  side: TradeSide;
  cardId: string;
  /** null = standard printing. */
  productId: number | null;
  qty: number;
  name: string;
  imageUrl: string;
  marketPrice: number | null;
  printingLabel: string | null;
};
export type TrayCard = Omit<TrayLine, "qty">;

/** What one party can put on the table for a card: spare copies in total, and copies of each owned alt printing. */
export type CardCap = { spare: number; printings: Record<number, number> };

export const lineKey = (l: { side: TradeSide; cardId: string; productId: number | null }) => `${l.side}:${l.cardId}:${l.productId ?? "base"}`;

/** Most copies this line can hold: spare is shared by every printing of the card; an alt printing is limited by the copies owned of it. */
export function lineCap(lines: TrayLine[], card: TrayCard, cap: CardCap): number {
  const key = lineKey(card);
  const others = lines.filter((l) => l.side === card.side && l.cardId === card.cardId && lineKey(l) !== key).reduce((n, l) => n + l.qty, 0);
  const byCard = cap.spare - others;
  const byPrinting = card.productId == null ? Infinity : (cap.printings[card.productId] ?? 0);
  return Math.max(0, Math.min(MAX_LINE_QTY, byCard, byPrinting));
}

/** Sets a line's copies (clamped to its cap); 0 removes it. Adding the same card + printing again merges into the one line. */
export function setLineQty(lines: TrayLine[], card: TrayCard, qty: number, cap: CardCap): TrayLine[] {
  const key = lineKey(card);
  const next = Math.min(Math.max(0, Math.floor(qty)), lineCap(lines, card, cap));
  const idx = lines.findIndex((l) => lineKey(l) === key);
  if (next <= 0) return idx < 0 ? lines : lines.filter((_, i) => i !== idx);
  if (idx >= 0) return lines.map((l, i) => (i === idx ? { ...l, qty: next } : l));
  if (lines.length >= MAX_LINES) return lines;
  return [...lines, { ...card, qty: next }];
}

export function lineQty(lines: TrayLine[], card: TrayCard): number {
  return lines.find((l) => lineKey(l) === lineKey(card))?.qty ?? 0;
}

const sumValue = (lines: { qty: number; marketPrice: number | null }[]): number | null => {
  let total = 0;
  for (const l of lines) {
    if (l.marketPrice == null) return null;
    total += l.qty * l.marketPrice;
  }
  return Math.round(total * 100) / 100;
};

/** Copies and market value per side; a value is null when any line on that side has no price. */
export function trayTotals(lines: TrayLine[]) {
  const give = lines.filter((l) => l.side === "give");
  const get = lines.filter((l) => l.side === "get");
  return {
    giveCopies: give.reduce((n, l) => n + l.qty, 0),
    getCopies: get.reduce((n, l) => n + l.qty, 0),
    giveValue: sumValue(give),
    getValue: sumValue(get),
  };
}

export function toLinesIn(lines: TrayLine[]): TradeLineIn[] {
  return lines.map((l) => ({ side: l.side, card_id: l.cardId, product_id: l.productId, qty: l.qty }));
}

const fromLine = (l: TradeLine, side: TradeSide): TrayLine => ({
  side,
  cardId: l.card_id,
  productId: l.product_id,
  qty: l.qty,
  name: l.name,
  imageUrl: l.image_url,
  marketPrice: l.market_price,
  printingLabel: l.printing_label,
});

/** A counter starts from the offer turned around: what they asked of me is what I give. */
export function counterPrefill(trade: Trade): TrayLine[] {
  return trade.lines.map((l) => fromLine(l, l.side === "give" ? "get" : "give"));
}

/** An offer from my side of the table: the lines I hand over, the lines I receive, and their values. */
export function tradeSides(trade: Trade) {
  const mine = (side: TradeSide) => trade.lines.filter((l) => l.side === (trade.i_am_sender ? side : side === "give" ? "get" : "give"));
  return {
    iGive: mine("give"),
    iGet: mine("get"),
    iGiveValue: trade.i_am_sender ? trade.give_value : trade.get_value,
    iGetValue: trade.i_am_sender ? trade.get_value : trade.give_value,
  };
}

export function otherUsername(trade: Trade): string {
  return trade.i_am_sender ? trade.to_username : trade.from_username;
}

/** Number on the Friends nav link: offers waiting for me plus trades in progress. */
export function navBadgeCount(summary: TradesSummary | undefined): number {
  if (!summary) return 0;
  return Math.max(0, summary.incoming_pending) + Math.max(0, summary.active);
}

export const badgeLabel = (n: number) => (n > 9 ? "9+" : String(n));

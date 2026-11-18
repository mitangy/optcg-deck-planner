import type { SpareItem, Trade, TradeLine, TradeLineIn, TradeSide, TradesOut, TradesSummary } from "./friendsApi";

export const MAX_LINE_QTY = 20;
export const MAX_LINES = 40;

export type TrayLine = {
  side: TradeSide;
  cardId: string;
  productId: number | null;
  qty: number;
  name: string;
  imageUrl: string;
  marketPrice: number | null;
  printingLabel: string | null;
};
export type TrayCard = Omit<TrayLine, "qty">;

export type CardCap = { spare: number; base: number; printings: Record<number, number> };

export const lineKey = (l: { side: TradeSide; cardId: string; productId: number | null }) => `${l.side}:${l.cardId}:${l.productId ?? "base"}`;

export function lineCap(lines: TrayLine[], card: TrayCard, cap: CardCap): number {
  const key = lineKey(card);
  const others = lines.filter((l) => l.side === card.side && l.cardId === card.cardId && lineKey(l) !== key).reduce((n, l) => n + l.qty, 0);
  const byCard = cap.spare - others;
  const byPrinting = card.productId == null ? cap.base : (cap.printings[card.productId] ?? 0);
  return Math.max(0, Math.min(MAX_LINE_QTY, byCard, byPrinting));
}

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

export function counterPrefill(trade: Trade): TrayLine[] {
  return trade.lines.map((l) => fromLine(l, l.side === "give" ? "get" : "give"));
}

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

export function navBadgeCount(summary: TradesSummary | undefined): number {
  if (!summary) return 0;
  return Math.max(0, summary.incoming_pending) + Math.max(0, summary.active);
}

export const capOf = (item: SpareItem): CardCap => ({
  spare: item.spare,
  base: item.base_owned,
  printings: Object.fromEntries(item.printings.map((p) => [p.product_id, p.owned])),
});

/** Printing a row defaults to: standard when owned, otherwise the first alt printing. */
export const defaultProductId = (item: SpareItem): number | null => (item.base_owned > 0 ? null : (item.printings[0]?.product_id ?? null));

// ---- #1362 status label, sections, ask param, undo delay ----

export function tradeStatusLabel(trade: Pick<Trade, "status" | "i_am_sender" | "my_applied" | "from_username" | "to_username">): string {
  const other = trade.i_am_sender ? trade.to_username : trade.from_username;
  switch (trade.status) {
    case "pending":
      return trade.i_am_sender ? `Waiting on ${other}` : "Your answer";
    case "accepted":
      return "Swap the cards";
    case "completed":
      return trade.my_applied ? "Traded" : "Update collection";
    case "countered":
      return "Countered";
    case "declined":
      return "Declined";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
  }
}

export type TradeSectionKey = "needs-you" | "in-progress" | "waiting" | "history";
export const TRADE_SECTION_TITLES: Record<TradeSectionKey, string> = {
  "needs-you": "Needs you",
  "in-progress": "In progress",
  waiting: "Waiting on them",
  history: "History",
};

export function tradeSectionKey(t: Pick<Trade, "status" | "i_am_sender" | "my_applied">): TradeSectionKey {
  if (t.status === "pending") return t.i_am_sender ? "waiting" : "needs-you";
  if (t.status === "completed" && !t.my_applied) return "needs-you";
  if (t.status === "accepted") return "in-progress";
  return "history";
}

/** Pills for states that need the viewer use the attention style; everything else is neutral. */
export const tradeStatusTone = (t: Pick<Trade, "status" | "i_am_sender" | "my_applied">): "attention" | "neutral" =>
  tradeSectionKey(t) === "needs-you" ? "attention" : "neutral";

export function tradeSections(out: TradesOut): { key: TradeSectionKey; title: string; trades: Trade[] }[] {
  const seen = new Set<number>();
  const buckets: Record<TradeSectionKey, Trade[]> = { "needs-you": [], "in-progress": [], waiting: [], history: [] };
  for (const t of [...out.incoming, ...out.active, ...out.outgoing, ...out.history]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    buckets[tradeSectionKey(t)].push(t);
  }
  return (["needs-you", "in-progress", "waiting", "history"] as TradeSectionKey[])
    .map((key) => ({ key, title: TRADE_SECTION_TITLES[key], trades: buckets[key] }))
    .filter((s) => s.trades.length > 0);
}

export type AskLine = { cardId: string; qty: number };

export const buildAskParam = (asks: AskLine[]): string =>
  asks
    .filter((a) => a.qty > 0)
    .map((a) => `${a.cardId}:${a.qty}`)
    .join(",");

export function parseAskParam(raw: string | null | undefined): AskLine[] {
  const merged = new Map<string, number>();
  for (const part of (raw ?? "").split(",")) {
    const [id, q] = part.split(":");
    const qty = Number(q);
    const cardId = (id ?? "").trim();
    if (!cardId || !Number.isInteger(qty) || qty <= 0) continue;
    merged.set(cardId, (merged.get(cardId) ?? 0) + qty);
  }
  return [...merged].slice(0, MAX_LINES).map(([cardId, qty]) => ({ cardId, qty }));
}

/** Copies of the friend's spares that you are still missing for a deck, capped by their spare. */
export function askableFromDeck(deckCards: { card_id: string; my_still_need: number }[], friendSpares: SpareItem[]): AskLine[] {
  const spare = new Map<string, number>();
  for (const i of friendSpares) spare.set(i.card_id, Math.max(spare.get(i.card_id) ?? 0, i.spare));
  const out: AskLine[] = [];
  for (const c of deckCards) {
    const qty = Math.min(c.my_still_need, spare.get(c.card_id) ?? 0);
    if (qty > 0) out.push({ cardId: c.card_id, qty });
  }
  return out;
}

/** Builds get-side tray lines for an ask param, respecting what the friend has spare. */
export function askToLines(asks: AskLine[], friendSpares: SpareItem[], lines: TrayLine[] = []): TrayLine[] {
  let next = lines;
  for (const a of asks) {
    const item = friendSpares.find((i) => i.card_id === a.cardId);
    if (!item) continue;
    const productId = defaultProductId(item);
    const chosen = item.printings.find((p) => p.product_id === productId);
    const card: TrayCard = {
      side: "get",
      cardId: item.card_id,
      productId,
      name: item.name,
      imageUrl: chosen?.image_url || item.image_url,
      marketPrice: item.market_price,
      printingLabel: chosen?.label ?? null,
    };
    next = setLineQty(next, card, lineQty(next, card) + a.qty, capOf(item));
  }
  return next;
}

/** Copies of their spares that are on your Shopping list. */
export const youNeedCopies = (youNeed: Pick<SpareItem, "spare" | "want">[]): number => youNeed.reduce((n, i) => n + Math.max(0, Math.min(i.spare, i.want)), 0);

export const UNDO_MS = 5000;

/** Runs `fn` after `ms` unless cancelled; flush() runs it now. Each call runs at most once. */
export function createDelayedCall(fn: () => void, ms: number) {
  let done = false;
  const fire = () => {
    if (done) return;
    done = true;
    globalThis.clearTimeout(timer);
    fn();
  };
  const timer = globalThis.setTimeout(fire, ms);
  return {
    cancel(): boolean {
      if (done) return false;
      done = true;
      globalThis.clearTimeout(timer);
      return true;
    },
    flush: fire,
  };
}

export const badgeLabel = (n: number) => (n > 9 ? "9+" : String(n));

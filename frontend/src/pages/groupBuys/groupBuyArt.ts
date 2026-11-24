import { money, type GroupBuyLine } from "../../api";
import { shownMarket } from "../../cards/altArt";

type ArtLine = Pick<
  GroupBuyLine,
  "my_qty" | "alt_arts" | "preferred_market_price" | "name" | "my_deck_qty" | "my_extras" | "bought_arts"
>;

export type MyArtSplit = {
  base: number;
  alts: { product_id: number; name: string; qty: number; price: number | null }[];
};

export function myArtSplit(line: ArtLine): MyArtSplit {
  let left = Math.max(0, line.my_qty);
  const alts: MyArtSplit["alts"] = [];
  const extras = (line.my_extras ?? [])
    .map((e) => ({ ...e, included: Math.max(0, e.wanted - e.skipped) }))
    .filter((e) => e.included > 0);
  let budget = Math.max(
    0,
    Math.min(left - Math.max(0, line.my_deck_qty ?? 0), extras.reduce((s, e) => s + e.included, 0)),
  );
  for (const e of extras) {
    const qty = Math.min(e.included, budget);
    if (qty <= 0) continue;
    budget -= qty;
    left -= qty;
    alts.push({ product_id: e.product_id, name: e.name, qty, price: e.market_price });
  }
  for (const alt of line.alt_arts ?? []) {
    const owned = Math.max(0, alt.owned ?? 0);
    const usableOwned = owned - Math.min(owned, Math.max(0, alt.collector ?? 0));
    const qty = Math.min(Math.max(0, (alt.wanted ?? 0) - usableOwned), left);
    if (qty <= 0) continue;
    left -= qty;
    alts.push({ product_id: alt.product_id, name: alt.name, qty, price: alt.market_price });
  }
  return { base: left, alts };
}

export function myAltBuyQty(line: ArtLine, productId: number): number {
  return myArtSplit(line)
    .alts.filter((a) => a.product_id === productId)
    .reduce((s, a) => s + a.qty, 0);
}

export type MyArtsTotal = {
  total: number | null;
  copies: number;
  breakdown: string;
};

/** The viewer's copies that sit in a seller order, at what was bought (#1443). */
function myBoughtParts(line: ArtLine) {
  return (line.bought_arts ?? [])
    .filter((b) => b.my_qty > 0)
    .map((b) => ({ label: b.product_id == null ? "Base" : b.name, qty: b.my_qty, price: b.unit_price }));
}

export function mySelectedArtsTotal(line: ArtLine): MyArtsTotal {
  const bought = myBoughtParts(line);
  const boughtQty = bought.reduce((s, p) => s + p.qty, 0);
  // Copies in an order keep what was bought; only the copies still to order follow the live picks.
  // Alt copies already bought are paid for, so only the rest of each alt want is still live.
  const boughtByArt = new Map((line.bought_arts ?? []).map((b) => [b.product_id, b.my_qty]));
  const { base, alts } = myArtSplit(
    boughtQty > 0
      ? {
          ...line,
          my_qty: Math.max(0, line.my_qty - boughtQty),
          alt_arts: line.alt_arts.map((a) => ({ ...a, wanted: Math.max(0, (a.wanted ?? 0) - (boughtByArt.get(a.product_id) ?? 0)) })),
        }
      : line,
  );
  const parts: { label: string; qty: number; price: number | null }[] = [...bought];
  if (base > 0) parts.push({ label: "Base", qty: base, price: line.preferred_market_price ?? null });
  for (const a of alts) parts.push({ label: a.name, qty: a.qty, price: a.price });
  const copies = parts.reduce((s, p) => s + p.qty, 0);
  const priced = parts.every((p) => p.price != null);
  const total = priced
    ? Math.round(parts.reduce((s, p) => s + p.qty * (p.price as number), 0) * 100) / 100
    : null;
  const breakdown = parts
    .map((p) => `${p.qty} × ${p.label} ${p.price != null ? money(p.price) : "n/a"}`)
    .join(" + ");
  return { total, copies, breakdown };
}

export function groupBuyShownPrice(
  line: ArtLine & Pick<GroupBuyLine, "market_price">,
): number | null {
  return line.my_qty > 0 ? mySelectedArtsTotal(line).total : (line.market_price ?? null);
}

export function altIncBlocked(line: ArtLine): boolean {
  return myArtSplit(line).base <= 0;
}

export function isLineExcluded(
  line: Pick<GroupBuyLine, "my_qty" | "my_is_custom" | "my_excluded">,
): boolean {
  return Boolean(line.my_excluded ?? (line.my_qty === 0 && line.my_is_custom));
}

export function visibleGroupBuyLines<
  L extends Pick<GroupBuyLine, "card_id" | "total_qty" | "my_qty" | "my_is_custom" | "my_excluded">,
>(lines: L[], opts: { showExcluded: boolean; keepVisible: ReadonlySet<string> }): L[] {
  return lines.filter((l) => {
    if (opts.keepVisible.has(l.card_id)) return true;
    const excluded = isLineExcluded(l);
    if (!opts.showExcluded && excluded && l.total_qty <= 0) return false;
    return l.total_qty > 0 || (opts.showExcluded && excluded);
  });
}

/** Each for a row: the price paid per bought copy once the card is in an order, otherwise the shown art's market price (#1443). */
export function lineEach(
  line: Pick<GroupBuyLine, "market_price" | "alt_arts" | "display_art" | "product_id" | "bought_arts" | "bought_each">,
): { price: number | null | undefined; productId: number | null | undefined; bought: boolean } {
  if (line.bought_arts?.length) {
    return { price: line.bought_each ?? null, productId: shownMarket(line).productId, bought: true };
  }
  return { ...shownMarket(line), bought: false };
}

/** Each: the market price of the art the row shows (the picked alt art when there is one, otherwise the base card). */
export function shownArtPrice(
  line: Pick<GroupBuyLine, "market_price" | "alt_arts" | "display_art">,
): number | null {
  return shownMarket(line).price ?? null;
}

/** The alt printings a card was bought as, in the order the receipt arts sort (#1443). Base copies have no printing here. */
export function boughtAlts(line: Pick<GroupBuyLine, "bought_arts" | "alt_arts">): GroupBuyLine["alt_arts"] {
  const bought = new Set((line.bought_arts ?? []).filter((b) => b.product_id != null).map((b) => b.product_id));
  return (line.alt_arts ?? []).filter((a) => bought.has(a.product_id));
}

/** "2 bought": the arts already in an order, in place of the "N alts · N picked" chip. */
export function boughtChipLabel(line: Pick<GroupBuyLine, "bought_arts">): string {
  const n = line.bought_arts?.length ?? 0;
  return `${n} bought`;
}

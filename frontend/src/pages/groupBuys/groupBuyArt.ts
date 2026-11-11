import { money, type GroupBuyLine } from "../../api";

/** The slice of a group-buy line the art split needs. */
type ArtLine = Pick<
  GroupBuyLine,
  "my_qty" | "alt_arts" | "preferred_market_price" | "name" | "my_deck_qty" | "my_extras"
>;

export type MyArtSplit = {
  /** Copies bought as the base (standard) printing. */
  base: number;
  /** Copies bought per alt art; only alts with qty > 0. */
  alts: { product_id: number; name: string; qty: number; price: number | null }[];
};

/**
 * How the viewer's buy qty splits across arts. Mirrors the backend
 * (`allocate_still_need_buys`): alt wants are filled first, in alt-list order,
 * each reduced by the copies of that alt you own (minus those an Extra copy
 * claims) and capped by what is left of the buy qty; the remainder is the base art (#1263).
 * Extra copies go first, minus the ones skipped in this buy, but only with what the buy
 * qty has left after the deck copies: a lower Your buy drops Extra copies first (#1269).
 */
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

export type MyArtsTotal = {
  /** Null when any picked art has no market price. */
  total: number | null;
  copies: number;
  /** e.g. "2 × Base $1.00 + 1 × Manga $9.00". */
  breakdown: string;
};

/** Total price of the viewer's copies across the arts they picked (base priced at the preferred printing). */
export function mySelectedArtsTotal(line: ArtLine): MyArtsTotal {
  const { base, alts } = myArtSplit(line);
  const parts: { label: string; qty: number; price: number | null }[] = [];
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

/**
 * The price shown under a group-buy card: your total across the arts you picked
 * when you buy any copies, otherwise the unit market price. The Price sort uses it (#876).
 */
export function groupBuyShownPrice(
  line: ArtLine & Pick<GroupBuyLine, "market_price">,
): number | null {
  return line.my_qty > 0 ? mySelectedArtsTotal(line).total : (line.market_price ?? null);
}

/**
 * + on an alt art moves one copy from the base art, so it has nothing to move
 * once the base art is down to 0 copies (#870).
 */
export function altIncBlocked(line: ArtLine): boolean {
  return myArtSplit(line).base <= 0;
}

/** Viewer opted out of this card (custom qty 0 / Exclude). */
export function isLineExcluded(
  line: Pick<GroupBuyLine, "my_qty" | "my_is_custom" | "my_excluded">,
): boolean {
  return Boolean(line.my_excluded ?? (line.my_qty === 0 && line.my_is_custom));
}

/**
 * Which group-buy lines the page lists. Still-needed only: an excluded line nobody
 * else needs stays hidden unless "Show excluded" is on. Cards the viewer edited in
 * this page session (`keepVisible`) stay listed so they can pick another art after
 * taking Base to 0 (#868).
 */
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

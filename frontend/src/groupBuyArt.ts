import { money, type GroupBuyLine } from "./api";

/** The slice of a group-buy line the art split needs. */
type ArtLine = Pick<
  GroupBuyLine,
  "my_qty" | "alt_arts" | "preferred_market_price" | "name"
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
 * each capped by what is left of the buy qty; the remainder is the base art.
 */
export function myArtSplit(line: ArtLine): MyArtSplit {
  let left = Math.max(0, line.my_qty);
  const alts: MyArtSplit["alts"] = [];
  for (const alt of line.alt_arts ?? []) {
    const qty = Math.min(Math.max(0, alt.wanted ?? 0), left);
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
 * Buy qty that leaves exactly `base` copies on the base art: the alt wants are
 * always filled first, so the base count rides on top of the total wanted.
 */
export function qtyForBase(line: Pick<GroupBuyLine, "alt_arts">, base: number): number {
  const wanted = (line.alt_arts ?? []).reduce((s, a) => s + Math.max(0, a.wanted ?? 0), 0);
  return wanted + Math.max(0, base);
}

/**
 * Buy qty after one alt's want changes: the base count stays as it is and every
 * other alt keeps its want, so + on an alt adds a copy instead of taking a base one.
 */
export function qtyForAltWant(line: ArtLine, productId: number, wanted: number): number {
  const { base } = myArtSplit(line);
  const others = (line.alt_arts ?? [])
    .filter((a) => a.product_id !== productId)
    .reduce((sum, a) => sum + Math.max(0, a.wanted ?? 0), 0);
  return base + others + Math.max(0, wanted);
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

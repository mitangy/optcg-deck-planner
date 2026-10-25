/** Rows of the photo-scan review tray, kept pure so the merge and add rules can be tested. */

import type { MultiScanConfidence, MultiScanItem } from "./cardScanMulti";

export const MAX_ROW_QTY = 99;

export type TrayRow = {
  /** Stable React key; survives a Fix. */
  key: string;
  cardId: string | null;
  /** "sure" < "check" < "none"; a merged row shows its weakest crop. */
  confidence: MultiScanConfidence;
  /** True once the user typed the card number. */
  fixed: boolean;
  /** Crop thumbnails, one per detected card in this row. */
  thumbs: string[];
  /** Copies to add. 0 = skip. */
  qty: number;
};

const RANK: Record<MultiScanConfidence, number> = {
  sure: 0,
  check: 1,
  none: 2,
};

const clampQty = (n: number) => Math.max(0, Math.min(MAX_ROW_QTY, Math.floor(n)));

/** One row per card id (two crops of OP01-120 -> qty 2); each unmatched crop keeps its own row at qty 0. */
export function buildTrayRows(items: MultiScanItem[]): TrayRow[] {
  const rows: TrayRow[] = [];
  const byId = new Map<string, TrayRow>();
  items.forEach((item, i) => {
    const id = item.confidence === "none" ? null : item.cardId?.trim().toUpperCase() || null;
    if (!id) {
      rows.push({
        key: `none-${i}`,
        cardId: null,
        confidence: "none",
        fixed: false,
        thumbs: [item.thumbUrl],
        qty: 0,
      });
      return;
    }
    const row = byId.get(id);
    if (row) {
      row.thumbs.push(item.thumbUrl);
      row.qty = clampQty(row.qty + 1);
      if (RANK[item.confidence] > RANK[row.confidence]) row.confidence = item.confidence;
      return;
    }
    const created: TrayRow = {
      key: id,
      cardId: id,
      confidence: item.confidence,
      fixed: false,
      thumbs: [item.thumbUrl],
      qty: 1,
    };
    byId.set(id, created);
    rows.push(created);
  });
  return rows;
}

/** Matched ids the catalog doesn't know become unmatched rows, so nothing unknown is ever sent. */
export function dropUnknownCards(rows: TrayRow[], known: ReadonlySet<string>): TrayRow[] {
  return rows.map((r) =>
    r.cardId && !known.has(r.cardId)
      ? { ...r, cardId: null, confidence: "none", fixed: false, qty: 0 }
      : r,
  );
}

/** Point a row at a typed card id. Joins an existing row for that card, summing copies. */
export function fixRow(rows: TrayRow[], key: string, cardId: string): TrayRow[] {
  const id = cardId.trim().toUpperCase();
  const target = rows.find((r) => r.key === key);
  if (!target || !id) return rows;
  const copies = Math.max(target.qty, target.thumbs.length);
  const twin = rows.find((r) => r.key !== key && r.cardId === id);
  if (twin) {
    return rows
      .filter((r) => r.key !== key)
      .map((r) =>
        r === twin
          ? {
              ...r,
              thumbs: [...r.thumbs, ...target.thumbs],
              qty: clampQty(r.qty + copies),
            }
          : r,
      );
  }
  return rows.map((r) =>
    r === target
      ? {
          ...r,
          cardId: id,
          confidence: "sure",
          fixed: true,
          qty: clampQty(copies),
        }
      : r,
  );
}

export function setRowQty(rows: TrayRow[], key: string, qty: number): TrayRow[] {
  return rows.map((r) => (r.key === key && r.cardId ? { ...r, qty: clampQty(qty) } : r));
}

/** Copies that will be added: rows with a card and a quantity above 0. */
export function trayAddPayload(rows: TrayRow[]): { card_id: string; add: number }[] {
  return rows.filter((r) => r.cardId && r.qty > 0).map((r) => ({ card_id: r.cardId!, add: r.qty }));
}

export function trayReadyCount(rows: TrayRow[]): number {
  return trayAddPayload(rows).reduce((n, i) => n + i.add, 0);
}


import type { ShoppingItem } from "../../api";
import type { MultiScanConfidence, MultiScanItem } from "../match/cardScanMulti";

export const MAX_ROW_QTY = 99;

export type TrayRow = {
  key: string;
  cardId: string | null;
  confidence: MultiScanConfidence;
  fixed: boolean;
  thumbs: string[];
  sources: number[];
  qty: number;
};

const RANK: Record<MultiScanConfidence, number> = {
  sure: 0,
  check: 1,
  none: 2,
};

const clampQty = (n: number) => Math.max(0, Math.min(MAX_ROW_QTY, Math.floor(n)));

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
        sources: [i],
        qty: 0,
      });
      return;
    }
    const row = byId.get(id);
    if (row) {
      row.thumbs.push(item.thumbUrl);
      row.sources.push(i);
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
      sources: [i],
      qty: 1,
    };
    byId.set(id, created);
    rows.push(created);
  });
  return rows;
}

export function dropUnknownCards(rows: TrayRow[], known: ReadonlySet<string>): TrayRow[] {
  return rows.map((r) =>
    r.cardId && !known.has(r.cardId)
      ? { ...r, cardId: null, confidence: "none", fixed: false, qty: 0 }
      : r,
  );
}

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
              sources: [...r.sources, ...target.sources],
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

export function trayAddPayload(rows: TrayRow[]): { card_id: string; add: number }[] {
  return rows.filter((r) => r.cardId && r.qty > 0).map((r) => ({ card_id: r.cardId!, add: r.qty }));
}

export function trayReadyCount(rows: TrayRow[]): number {
  return trayAddPayload(rows).reduce((n, i) => n + i.add, 0);
}

export function trayNeedText(item: ShoppingItem | undefined): string {
  if (!item) return "Not on your shopping list";
  if (item.still_need > 0) return `Still need ${item.still_need}`;
  return `Covered — you own ${item.owned} of ${item.need}`;
}

export type ScanSample = {
  image: string;
  predicted_id: string | null;
  confidence: MultiScanConfidence;
  final_id: string;
  label: "confirmed" | "corrected";
};

export function traySamples(rows: TrayRow[], items: MultiScanItem[]): ScanSample[] {
  const out: ScanSample[] = [];
  for (const row of rows) {
    if (!row.cardId || row.qty <= 0 || row.qty < row.sources.length) continue;
    for (const i of row.sources) {
      const item = items[i];
      if (!item?.sampleUrl) continue;
      const predicted = item.confidence === "none" ? null : (item.cardId?.trim().toUpperCase() ?? null);
      out.push({
        image: item.sampleUrl,
        predicted_id: predicted,
        confidence: item.confidence,
        final_id: row.cardId,
        label: predicted === row.cardId ? "confirmed" : "corrected",
      });
    }
  }
  return out;
}

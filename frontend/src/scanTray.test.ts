import { describe, expect, it } from "vitest";
import type { MultiScanConfidence, MultiScanItem } from "./cardScanMulti";
import {
  buildTrayRows,
  dropUnknownCards,
  fixRow,
  setRowQty,
  trayAddPayload,
  trayReadyCount,
} from "./scanTray";

const quad: MultiScanItem["quad"] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];
const item = (
  cardId: string | null,
  confidence: MultiScanConfidence,
  thumb: string,
): MultiScanItem => ({
  quad,
  thumbUrl: thumb,
  cardId,
  inliers: 0,
  runnerUp: 0,
  confidence,
});

describe("scan review tray rows (#701)", () => {
  it("merges crops of the same card into one row with the summed quantity and the weakest confidence (#701)", () => {
    const rows = buildTrayRows([
      item("OP01-120", "sure", "a"),
      item("OP01-001", "sure", "b"),
      item("op01-120", "check", "c"),
    ]);
    expect(rows.map((r) => [r.cardId, r.qty, r.confidence, r.thumbs])).toEqual([
      ["OP01-120", 2, "check", ["a", "c"]],
      ["OP01-001", 1, "sure", ["b"]],
    ]);
  });

  it("adds only rows that have a card and a quantity above zero (#701)", () => {
    let rows = buildTrayRows([
      item("OP01-120", "sure", "a"),
      item("OP01-120", "sure", "b"),
      item("OP01-001", "check", "c"),
      item(null, "none", "d"),
      item("OP01-077", "none", "e"),
    ]);
    expect(trayAddPayload(rows)).toEqual([
      { card_id: "OP01-120", add: 2 },
      { card_id: "OP01-001", add: 1 },
    ]);
    expect(trayReadyCount(rows)).toBe(3);
    rows = setRowQty(rows, "OP01-001", 0);
    expect(trayAddPayload(rows)).toEqual([{ card_id: "OP01-120", add: 2 }]);
    // An unmatched row has no card to add, whatever its stepper says.
    rows = setRowQty(rows, "none-3", 5);
    expect(rows.find((r) => r.key === "none-3")?.qty).toBe(0);
    expect(trayAddPayload(rows)).toEqual([{ card_id: "OP01-120", add: 2 }]);
  });

  it("Fix includes an unmatched row, and joins a row already holding that card (#701)", () => {
    const rows = buildTrayRows([
      item("OP01-120", "sure", "a"),
      item(null, "none", "b"),
      item(null, "none", "c"),
    ]);
    const fixed = fixRow(rows, "none-1", "op01-001");
    expect(trayAddPayload(fixed)).toEqual([
      { card_id: "OP01-120", add: 1 },
      { card_id: "OP01-001", add: 1 },
    ]);
    expect(fixed.find((r) => r.cardId === "OP01-001")).toMatchObject({
      confidence: "sure",
      fixed: true,
    });

    const joined = fixRow(fixed, "none-2", "OP01-120");
    expect(trayAddPayload(joined)).toEqual([
      { card_id: "OP01-120", add: 2 },
      { card_id: "OP01-001", add: 1 },
    ]);
    expect(joined).toHaveLength(2);
  });

  it("a matched id the catalog doesn't know is not sent (#701)", () => {
    const rows = dropUnknownCards(
      buildTrayRows([item("OP01-120", "sure", "a"), item("ZZ99-999", "sure", "b")]),
      new Set(["OP01-120"]),
    );
    expect(trayAddPayload(rows)).toEqual([{ card_id: "OP01-120", add: 1 }]);
    expect(rows[1]).toMatchObject({ cardId: null, confidence: "none", qty: 0 });
  });
});

import { describe, expect, it } from "vitest";
import type { MultiScanConfidence, MultiScanItem } from "./cardScanMulti";
import {
  buildTrayRows,
  dropUnknownCards,
  fixRow,
  setRowQty,
  trayAddPayload,
  trayReadyCount,
  traySamples,
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
  sampleUrl: `crop-${thumb}`,
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

describe("shared scan crops (#852)", () => {
  const items = (...list: [string | null, MultiScanConfidence][]) =>
    list.map(([id, c], i) => item(id, c, `t${i}`));

  it("labels a kept read confirmed and a typed fix corrected, keeping the scanner's own guess (#852)", () => {
    const scan = items(["OP01-120", "sure"], ["OP01-001", "check"], [null, "none"], ["OP01-077", "none"]);
    let rows = buildTrayRows(scan);
    rows = fixRow(rows, "OP01-001", "op01-002");
    rows = fixRow(rows, "none-2", "OP01-003");
    rows = fixRow(rows, "none-3", "OP01-004");
    expect(traySamples(rows, scan)).toEqual([
      { image: "crop-t0", predicted_id: "OP01-120", confidence: "sure", final_id: "OP01-120", label: "confirmed" },
      { image: "crop-t1", predicted_id: "OP01-001", confidence: "check", final_id: "OP01-002", label: "corrected" },
      { image: "crop-t2", predicted_id: null, confidence: "none", final_id: "OP01-003", label: "corrected" },
      { image: "crop-t3", predicted_id: null, confidence: "none", final_id: "OP01-004", label: "corrected" },
    ]);
  });

  it("skips the whole row when the user added fewer copies than there are crops (#852)", () => {
    const scan = items(["OP01-120", "sure"], ["OP01-120", "sure"], ["OP01-001", "sure"], ["OP01-002", "sure"], ["OP01-002", "sure"]);
    let rows = buildTrayRows(scan);
    rows = setRowQty(rows, "OP01-120", 1);
    rows = setRowQty(rows, "OP01-002", 3);
    expect(traySamples(rows, scan).map((s) => s.image)).toEqual(["crop-t2", "crop-t3", "crop-t4"]);
  });

  it("never shares skipped, unmatched or unknown-card rows (#852)", () => {
    const scan = items(["OP01-120", "sure"], ["OP01-001", "check"], [null, "none"], ["ZZ99-999", "sure"]);
    let rows = dropUnknownCards(buildTrayRows(scan), new Set(["OP01-120", "OP01-001"]));
    rows = setRowQty(rows, "OP01-001", 0);
    expect(traySamples(rows, scan).map((s) => s.image)).toEqual(["crop-t0"]);
  });

  it("a Fix that joins an existing row keeps every crop as its own sample (#852)", () => {
    const scan = items(["OP01-120", "sure"], [null, "none"]);
    const rows = fixRow(buildTrayRows(scan), "none-1", "OP01-120");
    expect(traySamples(rows, scan).map((s) => [s.image, s.label])).toEqual([
      ["crop-t0", "confirmed"],
      ["crop-t1", "corrected"],
    ]);
  });

  it("leaves out a crop that could not be cut (#852)", () => {
    const scan = items(["OP01-120", "sure"], ["OP01-120", "sure"]);
    scan[0] = { ...scan[0]!, sampleUrl: "" };
    expect(traySamples(buildTrayRows(scan), scan).map((s) => s.image)).toEqual(["crop-t1"]);
  });
});

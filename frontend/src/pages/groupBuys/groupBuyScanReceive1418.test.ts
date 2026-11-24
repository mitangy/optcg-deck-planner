import { describe, expect, it } from "vitest";
import type { GroupBuyLine, GroupBuyOrder } from "../../api";
import { applyScans, scanSummary, type ScanReceiveState } from "./groupBuyScanReceive";

const oline = (id: number, cardId: string, qty: number, productId: number | null = null) => ({
  id,
  card_id: cardId,
  name: cardId === "OP01-001" ? "Luffy" : cardId,
  product_id: productId,
  qty_ordered: qty,
  qty_arrived: 0,
  qty_extra: 0,
  allocations: [{ user_id: 1, display_name: "Nami", qty, qty_arrived: 0 }],
});

const order = (id: number, seller: string, lines: ReturnType<typeof oline>[]) =>
  ({ id, seller_name: seller, order_number: "", status: "on_the_way", version: 1, lines }) as unknown as GroupBuyOrder;

const lines = [{ card_id: "OP01-001", name: "Luffy" }] as GroupBuyLine[];
const empty = (ids: number[]): ScanReceiveState => ({ draft: Object.fromEntries(ids.map((i) => [i, 0])), notInOrder: [] });

describe("scan to receive (#1418)", () => {
  it("a scanned card with a known art bumps the line of that art, not the standard line (#1418)", () => {
    const o = order(1, "A", [oline(10, "OP01-001", 2), oline(11, "OP01-001", 2, 701)]);
    const r = applyScans(o, [o], lines, empty([10, 11]), [{ cardId: "OP01-001", productId: 701 }]);
    expect(r.draft).toEqual({ 10: 0, 11: 1 });
    expect(r.bumped).toEqual([11]);
  });

  it("a scan with no known art counts toward the standard line first (#1418)", () => {
    const o = order(1, "A", [oline(11, "OP01-001", 2, 701), oline(10, "OP01-001", 2)]);
    const r = applyScans(o, [o], lines, empty([10, 11]), [{ cardId: "OP01-001" }]);
    expect(r.draft).toEqual({ 10: 1, 11: 0 });
  });

  it("a scan of an art that is not in this order falls back to the standard line (#1418)", () => {
    const o = order(1, "A", [oline(10, "OP01-001", 2)]);
    const r = applyScans(o, [o], lines, empty([10]), [{ cardId: "OP01-001", productId: 999 }]);
    expect(r.draft).toEqual({ 10: 1 });
  });

  it("a card with only an alt line still counts when the scanner cannot tell the art (#1418)", () => {
    const o = order(1, "A", [oline(11, "OP01-001", 1, 701)]);
    const r = applyScans(o, [o], lines, empty([11]), [{ cardId: "OP01-001" }]);
    expect(r.draft).toEqual({ 11: 1 });
  });

  it("copies beyond the allocated count are listed under not in this order, never counted (#1418)", () => {
    const o = order(1, "A", [oline(10, "OP01-001", 2)]);
    const r = applyScans(o, [o], lines, empty([10]), Array(3).fill({ cardId: "OP01-001" }));
    expect(r.draft).toEqual({ 10: 2 });
    expect(r.counted).toBe(2);
    expect(r.notInOrder).toEqual([{ cardId: "OP01-001", name: "Luffy", count: 1, elsewhere: [] }]);
  });

  it("copies already counted before the scan use up the cap too (#1418)", () => {
    const o = order(1, "A", [oline(10, "OP01-001", 2)]);
    const r = applyScans(o, [o], lines, { draft: { 10: 2 }, notInOrder: [] }, [{ cardId: "OP01-001" }]);
    expect(r.draft).toEqual({ 10: 2 });
    expect(r.notInOrder[0]?.count).toBe(1);
  });

  it("a card another order of the group buy holds is hinted with that seller, and not applied to it (#1418)", () => {
    const a = order(1, "Grand Line", [oline(10, "OP01-001", 1)]);
    const b = order(2, "Sabaody", [oline(20, "OP02-002", 1)]);
    const c = order(3, "East Blue", [oline(30, "OP02-002", 1)]);
    const r = applyScans(a, [a, b, c], lines, empty([10]), [{ cardId: "OP02-002" }, { cardId: "OP02-002" }, { cardId: "ZZ9-999" }]);
    expect(r.draft).toEqual({ 10: 0 });
    expect(r.notInOrder).toEqual([
      { cardId: "OP02-002", name: "OP02-002", count: 2, elsewhere: ["Sabaody order", "East Blue order"] },
      { cardId: "ZZ9-999", name: "ZZ9-999", count: 1, elsewhere: [] },
    ]);
  });

  it("the not in this order list keeps growing across scans instead of resetting (#1418)", () => {
    const a = order(1, "A", [oline(10, "OP01-001", 1)]);
    const first = applyScans(a, [a], lines, empty([10]), [{ cardId: "ZZ9-999" }]);
    const second = applyScans(a, [a], lines, first, [{ cardId: "ZZ9-999" }]);
    expect(second.notInOrder).toEqual([{ cardId: "ZZ9-999", name: "ZZ9-999", count: 2, elsewhere: [] }]);
  });

  it("the scanner summary says what was counted, left over and unread (#1418)", () => {
    expect(scanSummary(4, 1, 2)).toBe("4 counted · 1 not in this order · 2 not recognised");
    expect(scanSummary(4, 0, 0)).toBe("4 counted");
  });
});

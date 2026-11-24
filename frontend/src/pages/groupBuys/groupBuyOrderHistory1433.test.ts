import { describe, expect, it } from "vitest";
import type { GroupBuyHistoryOrder } from "../../api";
import { addOrdersLabel, carryHistorySelection, historyCopies, historyHeading, looksLikeOrderHistory, pickedHistoryNumbers, startingHistorySelection } from "./groupBuyOrders";

const order = (number: string, over: Partial<GroupBuyHistoryOrder> = {}, qtys: number[] = [1]): GroupBuyHistoryOrder => ({
  order_number: number,
  order_date: "November 16, 2026",
  seller_name: "Grand Line Singles",
  tracking_number: "",
  tracking_url: "",
  already_added: false,
  in_group_buy: true,
  lines: qtys.map((qty, i) => ({ card_id: `OP01-00${i + 1}`, name: "Luffy", product_id: null, qty, allocations: [], qty_extra: 0 })),
  unmatched: [],
  ...over,
});

const PAGE = "ORDER DATE\nNovember 16, 2026\nORDER NUMBER\n8F3A21C0-77C1A0-1B3E4\nITEMS DETAILS PRICE QUANTITY\nShanks (022)\nRarity: SR\nCondition: Near Mint Foil $29.00 1";

describe("Order History paste detection (#1433)", () => {
  it("recognises a whole Order History page, copied or from a PDF", () => {
    expect(looksLikeOrderHistory(PAGE)).toBe(true);
    expect(looksLikeOrderHistory(PAGE.replace(/\n/g, "\t"))).toBe(true);
  });

  it("leaves a single order's Qty / Description paste alone", () => {
    expect(looksLikeOrderHistory("Qty\tDescription\n3\tMonkey D. Luffy")).toBe(false);
    expect(looksLikeOrderHistory("Order 8F3A21C0-77C1A0-1B3E4 shipped")).toBe(false);
    expect(looksLikeOrderHistory("Rarity: SR\nCondition: Near Mint $1.00 1")).toBe(false);
  });
});

describe("Order History selection (#1433)", () => {
  const orders = [
    order("A1", {}, [2, 1]),
    order("A2", { in_group_buy: false }),
    order("A3", { already_added: true }),
    order("A4"),
  ];

  it("starts with the orders that have cards from this group buy, never one already added", () => {
    expect(startingHistorySelection(orders)).toEqual(["A1", "A4"]);
  });

  it("imports the picked orders in page order and drops ones already added", () => {
    expect(pickedHistoryNumbers(orders, new Set(["A4", "A3", "A1"]))).toEqual(["A1", "A4"]);
  });

  it("counts copies from the picked orders only", () => {
    expect(historyCopies(orders, new Set(["A1", "A2", "A3"]))).toBe(3 + 1);
  });

  it("words the heading and the button for one and for many", () => {
    expect(historyHeading(10, 7)).toBe("Found 10 orders, 7 selected");
    expect(historyHeading(1, 1)).toBe("Found 1 order, 1 selected");
    expect(addOrdersLabel(7)).toBe("Add 7 orders");
    expect(addOrdersLabel(1)).toBe("Add 1 order");
  });
});

describe("Order History selection after more pages are uploaded (#1437)", () => {
  const before = [order("A1"), order("A2"), order("A3", { in_group_buy: false })];
  const after = [...before, order("A4"), order("A5", { in_group_buy: false }), order("A6", { already_added: true })];

  it("keeps the ticks and unticks of orders already listed and starts new ones by the usual rule", () => {
    // The host unticked A1 and ticked A3 (not part of this buy); A2 stayed ticked.
    const carried = carryHistorySelection(before, new Set(["A2", "A3"]), after);

    expect([...carried].sort()).toEqual(["A2", "A3", "A4"]);
  });

  it("never ticks an order that is already added", () => {
    expect(carryHistorySelection(before, new Set(["A1", "A6"]), [...after, order("A7", { already_added: true })]).has("A6")).toBe(false);
  });
});

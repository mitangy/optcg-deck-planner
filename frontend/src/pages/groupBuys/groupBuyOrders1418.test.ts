import { describe, expect, it } from "vitest";
import type { GroupBuyLine, GroupBuyOrder } from "../../api";
import {
  allArrivedDraft,
  arrivalDraft,
  arrivalPayload,
  artLabel,
  cardStatus,
  notOrderedCopies,
  orderChip,
  orderTitle,
  packageCounts,
  pickableLines,
  pickedOrderLines,
  progressLabels,
  sellersOnTheWay,
} from "./groupBuyOrders";

const line = (over: Partial<GroupBuyLine>) => ({ card_id: "OP01-001", name: "Luffy", alt_arts: [], members: [], ...over }) as GroupBuyLine;

const order = (over: Partial<GroupBuyOrder>) =>
  ({ id: 1, seller_name: "Grand Line", status: "on_the_way", qty_ordered: 4, qty_allocated: 4, qty_arrived: 0, qty_extra: 0, version: 3, order_number: "", tracking_url: "", lines: [], ...over }) as GroupBuyOrder;

const orderLine = (id: number, cardId: string, allocations: [number, number, number][], over: Partial<GroupBuyOrder["lines"][number]> = {}) => ({
  id,
  card_id: cardId,
  name: cardId,
  product_id: null,
  qty_ordered: allocations.reduce((s, a) => s + a[1], 0),
  qty_arrived: allocations.reduce((s, a) => s + a[2], 0),
  qty_extra: 0,
  allocations: allocations.map(([user_id, qty, qty_arrived]) => ({ user_id, display_name: `u${user_id}`, qty, qty_arrived })),
  ...over,
});

describe("package progress (#1418)", () => {
  const lines = [
    line({ in_order: 5, arrived: 2, not_ordered: 1, my_in_order: 3, my_arrived: 3, my_not_ordered: 0 }),
    line({ card_id: "OP01-002", in_order: 2, arrived: 0, not_ordered: 4, my_in_order: 1, my_arrived: 0, my_not_ordered: 2 }),
  ];

  it("copies on the way are the ordered copies that have not arrived, per card (#1418)", () => {
    expect(packageCounts(lines)).toEqual({ arrived: 2, onTheWay: 5, notOrdered: 5 });
  });

  it("Your cards counts from the viewer's own numbers, not the group's (#1418)", () => {
    expect(packageCounts(lines, true)).toEqual({ arrived: 3, onTheWay: 1, notOrdered: 2 });
  });

  it("the progress words list arrived, on the way and not in an order yet, in that order (#1418)", () => {
    expect(progressLabels({ arrived: 2, onTheWay: 5, notOrdered: 0 })).toEqual(["2 arrived", "5 on the way", "0 not in an order yet"]);
  });

  it("not-ordered copies add up across cards (#1418)", () => {
    expect(notOrderedCopies({ lines })).toBe(5);
  });
});

describe("status chips (#1418)", () => {
  it("a card whose copies all arrived says Arrived (#1418)", () => {
    expect(cardStatus({ arrived: 3, onTheWay: 0, notOrdered: 0 })).toEqual({ label: "Arrived", tone: "done" });
  });

  it("a card all on the way names the seller (#1418)", () => {
    expect(cardStatus({ arrived: 0, onTheWay: 2, notOrdered: 0 }, ["Grand Line", "Sea Cards"])).toEqual({ label: "On the way · Grand Line, Sea Cards", tone: "way" });
  });

  it("a card in no order says Not in an order yet (#1418)", () => {
    expect(cardStatus({ arrived: 0, onTheWay: 0, notOrdered: 2 })?.label).toBe("Not in an order yet");
  });

  it("a card in two states lists the counts instead of one word (#1418)", () => {
    expect(cardStatus({ arrived: 1, onTheWay: 2, notOrdered: 1 })).toEqual({ label: "1 arrived · 2 on the way · 1 not ordered", tone: "mixed" });
  });

  it("a card the viewer has no copies of gets no chip (#1418)", () => {
    expect(cardStatus({ arrived: 0, onTheWay: 0, notOrdered: 0 })).toBeNull();
  });

  it("an order that arrived with copies missing says how many are missing (#1418)", () => {
    expect(orderChip(order({ status: "partial", qty_allocated: 7, qty_arrived: 4 }))).toEqual({ label: "Arrived · 3 missing", tone: "mixed" });
    expect(orderChip(order({ status: "arrived" })).label).toBe("Arrived");
    expect(orderChip(order({ status: "on_the_way" })).label).toBe("On the way");
  });
});

describe("order cards (#1418)", () => {
  it("the title is the seller, then the last five characters of the order number (#1418)", () => {
    expect(orderTitle(order({ order_number: "8F3A21C0-77C1A0-1B3E4" }), 0)).toBe("Grand Line · …1B3E4");
  });

  it("members see the seller alone, and a nameless order falls back to its position (#1418)", () => {
    expect(orderTitle(order({}), 0)).toBe("Grand Line");
    expect(orderTitle(order({ seller_name: " " }), 1)).toBe("Order 2");
  });

  it("a short order number shows whole (#1418)", () => {
    expect(orderTitle(order({ order_number: "A12" }), 0)).toBe("Grand Line · …A12");
  });

  it("On the way names only unarrived orders that still hold copies for that member (#1418)", () => {
    const orders = [
      order({ id: 1, seller_name: "Grand Line", lines: [orderLine(1, "OP01-001", [[7, 2, 0]])] }),
      order({ id: 2, seller_name: "Sea Cards", lines: [orderLine(2, "OP01-001", [[7, 1, 1]])] }),
      order({ id: 3, seller_name: "Other Buyer", lines: [orderLine(3, "OP01-001", [[8, 2, 0]])] }),
      order({ id: 4, seller_name: "Done Co", status: "arrived", lines: [orderLine(4, "OP01-001", [[7, 1, 1]])] }),
    ];
    expect(sellersOnTheWay(orders, "OP01-001", 7)).toEqual(["Grand Line"]);
    expect(sellersOnTheWay(orders, "OP01-001")).toEqual(["Grand Line", "Other Buyer"]);
  });
});

describe("Check items (#1418)", () => {
  const o = order({
    version: 5,
    lines: [orderLine(11, "OP01-001", [[1, 2, 1], [2, 1, 0]], { qty_arrived: 4 }), orderLine(12, "OP01-002", [[1, 2, 1]], { qty_ordered: 3, qty_extra: 1 })],
  });

  it("starts from what already arrived, never above what members are allocated (#1418)", () => {
    expect(arrivalDraft(o)).toEqual({ 11: 3, 12: 1 });
  });

  it("All arrived fills every line to its allocation, leaving extras out (#1418)", () => {
    expect(allArrivedDraft(o)).toEqual({ 11: 3, 12: 2 });
  });

  it("Save sends every line with the order's version and clamps to the allocation (#1418)", () => {
    expect(arrivalPayload(o, { 11: 9, 12: -1 })).toEqual({
      expected_version: 5,
      lines: [
        { line_id: 11, qty_arrived: 3 },
        { line_id: 12, qty_arrived: 0 },
      ],
    });
  });
});

describe("Pick cards by hand (#1418)", () => {
  const lines = [
    line({ card_id: "OP01-001", not_ordered: 3 }),
    line({ card_id: "OP01-002", not_ordered: 0 }),
    line({ card_id: "OP01-003", not_ordered: 2 }),
  ];

  it("lists and sends only cards with copies not in an order yet, at most that many (#1418)", () => {
    expect(pickedOrderLines(lines, { "OP01-001": 9, "OP01-002": 4, "OP01-003": 0 })).toEqual([{ card_id: "OP01-001", qty: 3 }]);
  });

  it("the checklist offers only the cards that still have copies to order (#1418)", () => {
    expect(pickableLines(lines).map((l) => l.card_id)).toEqual(["OP01-001", "OP01-003"]);
  });

  it("an alt art is labelled by its name and the usual art as Base (#1418)", () => {
    const withAlt = line({ alt_arts: [{ product_id: 9, name: "Manga" } as never] });
    expect(artLabel(withAlt, 9)).toBe("Manga");
    expect(artLabel(withAlt, null)).toBe("Base");
  });
});

import { describe, expect, it } from "vitest";
import type { GroupBuyLine, GroupBuyOrder } from "../../api";
import {
  emptyPillFallback,
  hitsFirst,
  keepPlace,
  notOrderedMatches,
  packageHit,
  packagePills,
  packageStatus,
  packageView,
  thumbSplit,
  type PackageFilter,
  type PackageSort,
} from "./groupBuyOrders";

type Over = Partial<GroupBuyOrder> & { id: number };

function order(o: Over, cards: [string, string, string[]][] = []): GroupBuyOrder {
  return {
    seller_name: "",
    status: "on_the_way",
    qty_ordered: 1,
    qty_allocated: 1,
    qty_arrived: 0,
    qty_extra: 0,
    arrived_at: null,
    created_at: "",
    version: 1,
    order_number: "",
    tracking_url: "",
    receipt_text: "",
    ...o,
    lines: cards.map(([card_id, name, who], i) => ({
      id: o.id * 100 + i,
      card_id,
      name,
      product_id: null,
      qty_ordered: 1,
      qty_arrived: 0,
      qty_extra: 0,
      allocations: who.map((display_name, u) => ({ user_id: u + 1, display_name, qty: 1, qty_arrived: 0 })),
    })),
  } as GroupBuyOrder;
}

const view = (orders: GroupBuyOrder[], sort: PackageSort, query = "", filter: PackageFilter = "all") =>
  packageView(orders, { query, filter, sort, withMembers: true });
const ids = (v: ReturnType<typeof packageView>) => v.list.map((i) => i.order.id);

describe("package status and sorting (#1441)", () => {
  const orders = [
    order({ id: 1, status: "arrived", seller_name: "Zeta", qty_ordered: 2 }),
    order({ id: 2, status: "on_the_way", seller_name: "Quartz", qty_ordered: 9 }),
    order({ id: 3, status: "partial", seller_name: "", qty_ordered: 4 }),
    order({ id: 4, status: "on_the_way", seller_name: "alpha", qty_ordered: 9 }),
  ];

  it("a package marked arrived with cards short is Missing cards, an unknown status is On the way (#1441)", () => {
    expect(packageStatus({ status: "partial" })).toBe("partial");
    expect(packageStatus({ status: "arrived" })).toBe("arrived");
    expect(packageStatus({ status: "weird" })).toBe("on_the_way");
  });

  it("Not arrived first lists Missing cards, then On the way, then Arrived, each in the order added (#1441)", () => {
    expect(ids(view(orders, "not_arrived"))).toEqual([3, 2, 4, 1]);
  });

  it("Seller A–Z ignores case and puts packages with no seller name last (#1441)", () => {
    expect(ids(view(orders, "seller"))).toEqual([4, 2, 1, 3]);
  });

  it("Most copies puts the biggest package first and keeps the order added for ties (#1441)", () => {
    expect(ids(view(orders, "copies"))).toEqual([2, 4, 3, 1]);
  });

  it("Order added keeps the order the packages were added in (#1441)", () => {
    expect(ids(view(orders, "added"))).toEqual([1, 2, 3, 4]);
  });

  it("a pill shows only that status (#1441)", () => {
    expect(ids(view(orders, "added", "", "on_the_way"))).toEqual([2, 4]);
  });
});

describe("package search (#1441)", () => {
  const o = order(
    { id: 7, seller_name: "FreshlySqueezed TCG", order_number: "2A3F1C77-4B1E20-97AB0" },
    [
      ["OP01-120", "Shanks", ["Nami", "Zoro"]],
      ["OP05-119", "Monkey.D.Luffy", ["Usopp"]],
    ],
  );
  const hit = (q: string, members = true) => packageHit(o, q, members);

  it("finds a card by name, ignoring case, and says which card (#1441)", () => {
    const h = hit("SHANKS");
    expect(h.any).toBe(true);
    expect(h.lines.map((l) => l.card_id)).toEqual(["OP01-120"]);
  });

  it("finds a card number typed without its dash (#1441)", () => {
    expect(hit("op01120").lines.map((l) => l.name)).toEqual(["Shanks"]);
  });

  it("finds the seller by part of its name (#1441)", () => {
    expect(hit("squeezed").any).toBe(true);
    expect(hit("squeezed").lines).toEqual([]);
  });

  it("finds an order number across its dashes, from the tail the card shows (#1441)", () => {
    expect(hit("1c774b").any).toBe(true);
    expect(hit("#…97ab0").any).toBe(true);
  });

  it("does not look at order numbers for fewer than 3 characters (#1441)", () => {
    expect(hit("97").any).toBe(false);
  });

  it("finds a member's package only for the host (#1441)", () => {
    expect(hit("zoro").lines.map((l) => l.name)).toEqual(["Shanks"]);
    expect(hit("zoro", false).any).toBe(false);
  });

  it("matches nothing for a card that is not in the package (#1441)", () => {
    expect(hit("yamato").any).toBe(false);
  });
});

describe("package pills and counts (#1441)", () => {
  const orders = [
    order({ id: 1, status: "arrived", seller_name: "A" }, [["OP01-120", "Shanks", ["Nami"]]]),
    order({ id: 2, status: "on_the_way", seller_name: "B" }, [["OP01-120", "Shanks", ["Zoro"]]]),
    order({ id: 3, status: "on_the_way", seller_name: "C" }, [["OP02-001", "Ace", ["Nami"]]]),
    order({ id: 4, status: "partial", seller_name: "D" }, [["OP02-001", "Ace", ["Nami"]]]),
  ];

  it("the counts follow the search, not the whole group buy (#1441)", () => {
    expect(view(orders, "added", "shanks").counts).toEqual({ all: 2, on_the_way: 1, partial: 0, arrived: 1 });
    expect(view(orders, "added").counts).toEqual({ all: 4, on_the_way: 2, partial: 1, arrived: 1 });
  });

  it("the counts do not shrink when a pill is on (#1441)", () => {
    expect(view(orders, "added", "", "arrived").counts.on_the_way).toBe(2);
  });

  it("Missing cards hides at 0, and with a search every empty pill hides except All and the selected one (#1441)", () => {
    const none = { all: 2, on_the_way: 2, partial: 0, arrived: 0 };
    expect(packagePills(none, "all", false).map((p) => p.value)).toEqual(["all", "on_the_way", "arrived"]);
    expect(packagePills(none, "all", true).map((p) => p.value)).toEqual(["all", "on_the_way"]);
    expect(packagePills(none, "arrived", true).map((p) => p.value)).toEqual(["all", "on_the_way", "arrived"]);
  });

  it("an empty pill falls back to All unless a search explains it or packages are still on screen (#1441)", () => {
    const counts = { all: 3, on_the_way: 3, partial: 0, arrived: 0 };
    expect(emptyPillFallback("partial", counts, false, 0)).toBe("all");
    expect(emptyPillFallback("partial", counts, true, 0)).toBe("partial");
    expect(emptyPillFallback("partial", counts, false, 1)).toBe("partial");
    expect(emptyPillFallback("on_the_way", counts, false, 0)).toBe("on_the_way");
  });
});

describe("package layout helpers (#1441)", () => {
  it("a package marked arrived keeps its place until the view changes, and a new match goes last (#1441)", () => {
    expect(keepPlace([3, 1, 2], [1, 2, 5], new Set([1, 2, 3, 5]))).toEqual([3, 1, 2, 5]);
    expect(keepPlace([3, 1, 2], [1], new Set([1, 3]))).toEqual([3, 1]);
  });

  it("more cards than fit show one fewer and a +N chip (#1441)", () => {
    expect(thumbSplit(5, 300, 54)).toEqual({ shown: 5, more: 0 });
    expect(thumbSplit(8, 300, 54)).toEqual({ shown: 4, more: 4 });
    expect(thumbSplit(2, 10, 54)).toEqual({ shown: 1, more: 1 });
  });

  it("the cards the search found come first (#1441)", () => {
    const o = order({ id: 1 }, [["A-1", "A", []], ["B-1", "B", []], ["C-1", "C", []]]);
    expect(hitsFirst(o.lines, [o.lines[2]]).map((l) => l.card_id)).toEqual(["C-1", "A-1", "B-1"]);
  });

  it("a search names the copies of a card that are not in an order yet, and who they are for (#1441)", () => {
    const lines = [
      { card_id: "OP03-001", name: "Yamato", not_ordered: 1, not_ordered_members: [{ user_id: 3, display_name: "Usopp", qty: 1, product_id: null }] },
      { card_id: "OP03-002", name: "Ace", not_ordered: 0, not_ordered_members: [] },
    ] as unknown as GroupBuyLine[];
    expect(notOrderedMatches(lines, "yamato")).toEqual([{ name: "Yamato", copies: 1, who: ["Usopp"] }]);
    expect(notOrderedMatches(lines, "ace")).toEqual([]);
  });
});

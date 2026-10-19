import { describe, expect, it } from "vitest";
import { nextColumnSort, sortByColumn, type ColumnSort } from "./columnSort";

type Row = { id: string; price: number | null; name?: string };
const value = (r: Row, key: string) => (key === "name" ? r.name : r.price);
const ids = (rows: Row[]) => rows.map((r) => r.id);

describe("nextColumnSort", () => {
  it("cycles first direction, reverse, then clears (#636)", () => {
    const first = nextColumnSort(null, "market", "desc");
    expect(first).toEqual({ key: "market", dir: "desc" });
    const second = nextColumnSort(first, "market", "desc");
    expect(second).toEqual({ key: "market", dir: "asc" });
    expect(nextColumnSort(second, "market", "desc")).toBeNull();
  });

  it("starts text columns ascending and reverses to descending (#636)", () => {
    const first = nextColumnSort(null, "card", "asc");
    expect(first).toEqual({ key: "card", dir: "asc" });
    expect(nextColumnSort(first, "card", "asc")).toEqual({ key: "card", dir: "desc" });
  });

  it("switching to another column restarts at that column's first direction (#636)", () => {
    const reversed: ColumnSort = { key: "market", dir: "asc" };
    expect(nextColumnSort(reversed, "owned", "desc")).toEqual({ key: "owned", dir: "desc" });
  });
});

describe("sortByColumn", () => {
  const rows: Row[] = [
    { id: "a", price: 2 },
    { id: "b", price: 10 },
    { id: "c", price: null },
    { id: "d", price: 5 },
  ];

  it("keeps empty values last in both directions (#636)", () => {
    expect(ids(sortByColumn(rows, { key: "price", dir: "asc" }, value))).toEqual(["a", "d", "b", "c"]);
    expect(ids(sortByColumn(rows, { key: "price", dir: "desc" }, value))).toEqual(["b", "d", "a", "c"]);
  });

  it("treats an empty string like a missing value (#636)", () => {
    const named: Row[] = [
      { id: "a", price: 0, name: "" },
      { id: "b", price: 0, name: "Zoro" },
      { id: "c", price: 0, name: "Ace" },
    ];
    expect(ids(sortByColumn(named, { key: "name", dir: "asc" }, value))).toEqual(["c", "b", "a"]);
    expect(ids(sortByColumn(named, { key: "name", dir: "desc" }, value))).toEqual(["b", "c", "a"]);
  });

  it("compares numbers by value, not as text (#636)", () => {
    // As text "10" < "2"; numerically 2 comes first.
    expect(ids(sortByColumn(rows, { key: "price", dir: "asc" }, value)).slice(0, 2)).toEqual(["a", "d"]);
  });

  it("ties keep the incoming order in both directions (#636)", () => {
    const tied: Row[] = [
      { id: "z", price: 3 },
      { id: "m", price: 3 },
      { id: "a", price: 3 },
      { id: "q", price: 1 },
    ];
    expect(ids(sortByColumn(tied, { key: "price", dir: "asc" }, value))).toEqual(["q", "z", "m", "a"]);
    expect(ids(sortByColumn(tied, { key: "price", dir: "desc" }, value))).toEqual(["z", "m", "a", "q"]);
  });

  it("reads card numbers in natural order, OP01-2 before OP01-10 (#636)", () => {
    const cards: Row[] = [
      { id: "1", price: 0, name: "OP01-10" },
      { id: "2", price: 0, name: "OP01-2" },
      { id: "3", price: 0, name: "op01-1" },
    ];
    expect(ids(sortByColumn(cards, { key: "name", dir: "asc" }, value))).toEqual(["3", "2", "1"]);
  });
});

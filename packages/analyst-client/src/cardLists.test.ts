import { describe, expect, it } from "vitest";
import { canAddCopy, copiesIn, parseCardList } from "./cardLists";

const row = (over: Record<string, unknown> = {}) => ({ id: "OP01-022", name: "Brook", type: "character", colors: ["red"], cost: 4, power: 5000, counter: 1000, reason: "-2000 power", ...over });
const wire = (over: Record<string, unknown> = {}) => ({ id: "l1", version: 1, kind: "card_list", title: "Red Straw Hats", cards: [row()], leader_id: "OP01-001", ...over });

describe("card lists (#1450)", () => {
  it("reads a list from its wire shape, with numbers and the any-number mark (#1450)", () => {
    const list = parseCardList(wire({ cards: [row(), row({ id: "op01-075", name: "Pacifista", any_number: true, cost: null, power: null, counter: null })] }))!;
    expect(list).toMatchObject({ id: "l1", title: "Red Straw Hats", leaderId: "OP01-001" });
    expect(list.cards[0]).toEqual({ id: "OP01-022", name: "Brook", type: "character", colors: ["red"], cost: 4, power: 5000, counter: 1000, reason: "-2000 power", anyNumber: false });
    expect(list.cards[1]).toMatchObject({ id: "OP01-075", anyNumber: true, cost: undefined });
  });

  it("drops rows it can't use and repeated cards, and a list left with none (#1450)", () => {
    const list = parseCardList(wire({ cards: [row({ id: "OP01-099", type: "monster" }), { id: "" }, "x", row(), row({ id: "op01-022" })] }))!;
    expect(list.cards.map((c) => c.id)).toEqual(["OP01-022"]);
    expect(parseCardList(wire({ cards: [] }))).toBeNull();
    expect(parseCardList(wire({ id: "" }))).toBeNull();
    expect(parseCardList(null)).toBeNull();
  });

  it("keeps at most 24 cards (#1450)", () => {
    const cards = Array.from({ length: 30 }, (_, i) => row({ id: `OP01-${String(i + 1).padStart(3, "0")}` }));
    expect(parseCardList(wire({ cards }))!.cards).toHaveLength(24);
  });

  it("counts copies across lines and ids written differently (#1450)", () => {
    expect(copiesIn([{ id: "op01-022", copies: 2 }, { id: "OP01-022", copies: 1 }, { id: "OP01-001", copies: 1 }], "OP01-022")).toBe(3);
    expect(copiesIn([], "OP01-022")).toBe(0);
  });

  it("stops at four copies, but not for an any-number card, and never adds a leader (#1450)", () => {
    expect(canAddCopy({ type: "character", anyNumber: false }, 3)).toBe(true);
    expect(canAddCopy({ type: "character", anyNumber: false }, 4)).toBe(false);
    expect(canAddCopy({ type: "character", anyNumber: true }, 9)).toBe(true);
    expect(canAddCopy({ type: "leader", anyNumber: false }, 0)).toBe(false);
  });
});

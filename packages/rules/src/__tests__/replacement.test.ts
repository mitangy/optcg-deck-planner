import { describe, expect, it } from "vitest";
import { Harness } from "../testing/harness.js";
import type { Seat } from "../types.js";

// Replacement effects: batch covering and bookkeeping between acts of one ability.

const NAMI = "OP17-023"; // 1-cost {East Blue}/{Straw Hat Crew}: if one of your such Characters would be K.O.'d, you may rest this Character instead.
const ARAMAKI = "OP17-059"; // [On Play] DON!! -1: Draw 1 card and K.O. up to 2 of your opponent's Characters with a cost of 2 or less.
const LUCCI = "OP05-093"; // [On Play] place 3 cards from your trash at the bottom of your deck: K.O. up to 1 cost 2 or less and up to 1 cost 1 or less.
const ALVIDA_EAST_BLUE = "OP03-023"; // vanilla 1-cost {East Blue}
const MERRY = "OP03-052"; // vanilla 1-cost {East Blue}
const KAROO = "ST01-003"; // vanilla 1-cost {Animal}/{Alabasta}

function ids(h: Harness, seat: Seat): string[] {
  return h.state.players[seat].characters.map((c) => c.defId);
}

/** Seat 1 plays Aramaki and K.O.s `targets` of seat 0's field; stops at the first replacement prompt. */
function aramakiAt(field: string[], targets: string[]): Harness {
  const h = new Harness();
  h.field(0, ...field);
  h.hand(1, ARAMAKI);
  h.don(1, 7);
  h.act(0, { type: "end_turn" });
  h.play(1, ARAMAKI).accept().pick("DON").pick(...targets);
  return h;
}

describe("batch-covering replacement", () => {
  it("declining the first replacement does not save the later targets, which are asked again (#649)", () => {
    const h = aramakiAt([NAMI, ALVIDA_EAST_BLUE, MERRY], [ALVIDA_EAST_BLUE, MERRY]);
    expect(h.choice?.request?.type).toBe("confirm");
    h.decline();
    // Alvida is gone and Merry is not covered: Nami is asked again.
    expect(ids(h, 0)).toEqual([NAMI, MERRY]);
    expect(h.choice?.request?.type).toBe("confirm");
    h.decline();
    expect(ids(h, 0)).toEqual([NAMI]);
    expect(h.state.players[0].characters[0]!.rested).toBe(false);
  });

  it("one acceptance saves only the later targets its selector matches (#649)", () => {
    const h = aramakiAt([NAMI, ALVIDA_EAST_BLUE, KAROO], [ALVIDA_EAST_BLUE, KAROO]);
    h.accept();
    // Karoo is neither {East Blue} nor {Straw Hat Crew}: Nami cannot save it.
    expect(ids(h, 0)).toEqual([NAMI, ALVIDA_EAST_BLUE]);
    expect(h.choice).toBeUndefined();
  });
});

describe("replacement bookkeeping between acts of one ability", () => {
  /** Seat 1 plays Lucci: it K.O.s up to 1 Character with cost 2 or less, then up to 1 with cost 1 or less, as two separate acts. */
  function lucci(field: string[]): Harness {
    const h = new Harness();
    h.field(0, ...field);
    h.hand(1, LUCCI);
    h.don(1, 4);
    h.trash(1, KAROO, KAROO, KAROO);
    h.act(0, { type: "end_turn" });
    h.play(1, LUCCI).accept();
    return h;
  }

  it("the second K.O. of one ability picks its own target rather than reusing the first act's (#649)", () => {
    const h = lucci([ALVIDA_EAST_BLUE, MERRY]);
    h.pick(ALVIDA_EAST_BLUE);
    h.pick(MERRY);
    expect(ids(h, 0)).toEqual([]);
  });

  it("a K.O. saved by Nami does not protect the same Character from the ability's second K.O. (#649)", () => {
    const h = lucci([NAMI, ALVIDA_EAST_BLUE]);
    h.pick(ALVIDA_EAST_BLUE);
    h.accept();
    expect(ids(h, 0)).toEqual([NAMI, ALVIDA_EAST_BLUE]);
    expect(h.state.players[0].characters[0]!.rested).toBe(true);
    // Nami is rested now and cannot be paid again: the second K.O. goes through.
    h.pick(ALVIDA_EAST_BLUE);
    expect(ids(h, 0)).toEqual([NAMI]);
  });
});

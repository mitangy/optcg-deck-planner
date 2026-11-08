import { describe, expect, it } from "vitest";
import { Harness } from "../testing/harness.js";

// Effect selections: which cards are offered and what the chooser is told about the limits.

const KAROO = "ST01-003"; // vanilla 1-cost {Animal}/{Alabasta}
const ALVIDA = "OP03-023"; // vanilla 1-cost {East Blue}

describe("picking a Character to play by an effect", () => {
  const LUFFY = "OP02-041"; // [On Play] Play up to 1 {FILM} or {Straw Hat Crew} type Character card with a cost of 4 or less from your hand.
  const ZORO = "OP12-036"; // 4-cost {Straw Hat Crew}. This card in your hand cannot be played by effects.
  const ROBIN = "ST01-008"; // vanilla 3-cost {Straw Hat Crew}
  const GERD = "OP17-081"; // [On Play] You may trash 1 card from your hand: Add up to 1 Character card with a cost of 8 or less other than [Gerd] from your trash to your hand.

  const optionDefs = (h: Harness) => (h.choice!.request as { options: { defId?: string }[] }).options.map((o) => o.defId);

  it("does not offer a card that cannot be played by effects (#753)", () => {
    const h = new Harness();
    h.hand(0, LUFFY, ZORO, ROBIN);
    h.don(0, 7);
    h.play(0, LUFFY);
    expect(optionDefs(h)).toEqual([ROBIN]);
  });

  it("offers that same card when the effect only adds it to the hand (#753)", () => {
    const h = new Harness();
    h.hand(0, GERD, KAROO);
    h.trash(0, ZORO);
    h.don(0, 2);
    h.play(0, GERD).accept().pick(KAROO);
    expect(optionDefs(h)).toContain(ZORO);
  });
});

describe("a selection with a total limit or distinct names", () => {
  const LOKI = "OP17-119"; // [On Play] K.O. your opponent's Characters with a total cost of 4 or less.
  const SABO = "OP05-007"; // [On Play] K.O. up to 2 of your opponent's Characters with a total power of 4000 or less.
  const XEBEC = "OP17-118"; // [On Play] Draw 1 card and play up to 2 {Rocks Pirates} type cards with different card names and a total cost of 9 or less from your hand.
  const STUSSY = "EB05-006"; // 2-cost {Rocks Pirates}
  const GLORIOSA = "EB05-052"; // 4-cost {Rocks Pirates}
  const KYO = "OP17-045"; // 2-cost {Rocks Pirates}
  const SAI = "OP01-012"; // vanilla 2-cost 4000
  const WIRE = "OP01-053"; // vanilla 2-cost

  const request = (h: Harness) => h.choice!.request as unknown as Record<string, unknown>;

  it("tells the chooser the total cost limit (#753)", () => {
    const h = new Harness();
    h.hand(0, LOKI);
    h.don(0, 10);
    h.field(1, SAI, WIRE, ALVIDA);
    h.play(0, LOKI);
    expect(request(h).totalCostAtMost).toBe(4);
    expect(request(h).totalPowerAtMost).toBeUndefined();
  });

  it("tells the chooser the total power limit (#753)", () => {
    const h = new Harness();
    h.hand(0, SABO);
    h.don(0, 10);
    h.field(1, SAI, WIRE);
    h.play(0, SABO);
    expect(request(h).totalPowerAtMost).toBe(4000);
    expect(request(h).totalCostAtMost).toBeUndefined();
  });

  it("tells the chooser the cards must have different names, and the total cost limit (#753)", () => {
    const h = new Harness();
    h.hand(0, XEBEC, STUSSY, GLORIOSA, KYO);
    h.don(0, 10);
    h.play(0, XEBEC);
    expect(request(h).distinctNames).toBe(true);
    expect(request(h).totalCostAtMost).toBe(9);
  });

  it("does not claim distinct names for a selection that has no such rule (#753)", () => {
    const h = new Harness();
    h.hand(0, LOKI);
    h.don(0, 10);
    h.field(1, SAI, WIRE, ALVIDA);
    h.play(0, LOKI);
    expect(request(h).distinctNames).toBeUndefined();
  });
});

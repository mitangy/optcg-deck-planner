import { describe, expect, it } from "vitest";
import { Harness } from "../testing/harness.js";

const KAROO = "ST01-003";
const ALVIDA = "OP03-023";

describe("picking a Character to play by an effect", () => {
  const LUFFY = "OP02-041";
  const ZORO = "OP12-036";
  const ROBIN = "ST01-008";
  const GERD = "OP17-081";

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
  const LOKI = "OP17-119";
  const SABO = "OP05-007";
  const XEBEC = "OP17-118";
  const STUSSY = "EB05-006";
  const GLORIOSA = "EB05-052";
  const KYO = "OP17-045";
  const SAI = "OP01-012";
  const WIRE = "OP01-053";

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

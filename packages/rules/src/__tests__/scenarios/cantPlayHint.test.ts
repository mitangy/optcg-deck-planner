import { describe, expect, it } from "vitest";
import { Harness } from "../../testing/harness.js";

const KAROO = "ST01-003";
const ROBIN = "ST01-008";
const BORSALINO = "ST33-004";
const ALVIDA = "EB05-021";
const MIHAWK = "OP09-048";
const EVENT = "ST01-014";

/** Buggy leader trashes Robin, plays Alvida, Alvida plays Mihawk: Borsalino is -3 cost but no Character may be played. */
function alvidaChain(extraHand: string[] = []) {
  const h = new Harness({ leaders: ["OP09-042", "ST01-001"] });
  h.clearHands();
  h.don(0, 10, 0);
  h.hand(0, ROBIN, ALVIDA, MIHAWK, BORSALINO, KAROO, ...extraHand);
  h.deckTop(0, KAROO, KAROO, KAROO, KAROO, KAROO);
  h.act(0, { type: "activate_ability", sourceId: h.state.players[0].leader.id, abilityId: "op09-042#0" } as never);
  for (let i = 0; i < 8 && h.choice; i++) {
    const p = h.choice.prompt ?? "";
    if (/trash/i.test(p)) h.pick(i < 1 ? ROBIN : KAROO);
    else if (/Alvida|Cross Guild|play/i.test(p) && i < 2) h.pick(ALVIDA);
    else if (/play/i.test(p)) h.pick(MIHAWK);
    else h.accept();
  }
  return h;
}

describe("hand view says why a card cannot be played", () => {
  it("after Alvida, a Character in hand is blocked with its reduced cost; an Event is not (#671)", () => {
    const h = alvidaChain([EVENT]);
    const hand = h.view(0).you.hand;
    const borsalino = hand.find((c) => c.defId === BORSALINO)!;
    expect(borsalino.playCost).toBe(3);
    expect(borsalino.blocked).toBe("characters");
    expect(hand.find((c) => c.defId === EVENT)!.blocked).toBeUndefined();
  });

  it("with no play restriction, no hand card is blocked (#671)", () => {
    const h = new Harness();
    h.clearHands();
    h.don(0, 10, 0);
    h.hand(0, BORSALINO, KAROO, EVENT);
    expect(h.view(0).you.hand.map((c) => c.blocked)).toEqual([undefined, undefined, undefined]);
  });
});

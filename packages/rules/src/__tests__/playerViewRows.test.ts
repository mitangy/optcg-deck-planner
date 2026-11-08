import { describe, expect, it } from "vitest";
import { Harness } from "../testing/harness.js";

// Player view rows: hand rows and static results read through the query cache.

const KAROO = "ST01-003"; // vanilla 1-cost {Animal}/{Alabasta}

describe("hand rows in the player view", () => {
  const SHANKS = "OP13-028"; // 10-cost. [On Play] Set all of your DON!! cards as active. Then, you cannot play cards from your hand during this turn.
  const GUARD_POINT = "ST01-014"; // 1-cost Event

  function afterShanks() {
    const h = new Harness();
    h.hand(0, SHANKS, KAROO, GUARD_POINT);
    h.don(0, 10);
    h.play(0, SHANKS);
    return h;
  }

  it("say a hand lock blocks every card in hand, Characters and Events alike (#753)", () => {
    const h = afterShanks();
    expect(h.view(0).you.hand.map((c) => [c.defId, c.playCost, c.blocked])).toEqual([[KAROO, 1, "from_hand"], [GUARD_POINT, 1, "from_hand"]]);
  });

  it("show no play cost and no block while the opponent is the one in their main phase (#753)", () => {
    const h = afterShanks();
    h.hand(1, KAROO);
    expect(h.view(1).you.hand.map((c) => [c.playCost, c.blocked])).toEqual([[undefined, undefined]]);
  });

  it("show no play cost and no block outside the main phase (#753)", () => {
    const h = afterShanks();
    const [attacker] = h.field(0, KAROO);
    h.attack(attacker!, "leader");
    expect(h.state.phase).not.toBe("main");
    expect(h.view(0).you.hand.map((c) => [c.playCost, c.blocked])).toEqual([[undefined, undefined], [undefined, undefined]]);
  });
});

describe("static results read through the query cache", () => {
  const INAZUMA = "OP05-003"; // 3-cost: [Rush] if you have another Character with 7000 power or more. Its check looks at every Character of yours, Yamato included.
  const YAMATO = "EB05-046"; // 4-cost 5000: if your opponent has a Character with 8000 base power or more, this Character gains [Blocker] and +3000 power.
  const LOKI = "OP17-119"; // 8000 base power

  it("a Character keeps its own static bonuses in the view after another card's condition has looked at it (#753)", () => {
    const h = new Harness();
    h.field(0, INAZUMA, YAMATO);
    h.field(1, LOKI);
    const yamato = h.view(0).you.characters.find((c) => c.defId === YAMATO)!;
    expect(yamato.power).toBe(5000 + 3000);
    expect(yamato.keywords).toContain("blocker");
  });
});

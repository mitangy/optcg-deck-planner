/**
 * A Double Attack's 2 damage is one hit (#458): effects that care about taking or dealing
 * damage see it once, the same way Gloriosa EB05-052's damage replacement does.
 */
import { describe, expect, it } from "vitest";
import { FILLER, Harness } from "../../testing/harness.js";

describe("Double Attack is one hit for damage effects (#458)", () => {
  function doubleAttackWith(watcher: string) {
    const h = new Harness();
    h.field(0, watcher);
    const [ace] = h.field(0, "P-028"); // [Double Attack]
    h.life(1, FILLER, FILLER, FILLER);
    h.attack(ace!, "leader").passBattle({ resolveLifeChecks: false });
    return h;
  }

  it("Gaimon's 'when you deal damage' is offered once for a Double Attack hit (#458)", () => {
    const h = doubleAttackWith("OP03-043");
    let offers = 0;
    for (let i = 0; i < 6 && h.choice; i += 1) {
      if (h.choice.kind === "effect" && h.choice.cardDefId === "OP03-043") offers += 1;
      h.decline(h.choice.seat);
    }
    expect(h.state.players[1].life.length).toBe(1);
    expect(offers).toBe(1);
  });
});

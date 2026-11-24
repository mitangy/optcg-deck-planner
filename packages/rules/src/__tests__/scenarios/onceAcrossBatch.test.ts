import { describe, expect, it } from "vitest";
import { Harness } from "../../testing/harness.js";

const SANDERSONIA = "OP16-111";
const MARIGOLD = "OP16-113";
const DEMON_FACE = "OP01-056";
const KAROO = "ST01-003";

describe("OP14-041 Boa Hancock Leader trigger (#600)", () => {
  function koBothSisters() {
    const h = new Harness({ leaders: ["OP14-041", "ST01-001"] });
    for (const c of h.field(0, SANDERSONIA, MARIGOLD)) c.rested = true;
    h.don(0, 1);
    h.attach(0, h.state.players[0].leader, 1);
    h.life(1, KAROO, KAROO, KAROO);
    h.act(0, { type: "end_turn" });
    h.hand(1, DEMON_FACE);
    h.don(1, 6);
    h.play(1, DEMON_FACE);
    h.pick(SANDERSONIA, MARIGOLD);
    return h;
  }

  it("asks once when both Gorgon sisters are K.O.'d at the same time (#600)", () => {
    const h = koBothSisters();
    expect(h.state.players[0].characters.length).toBe(0);
    expect(h.choice?.kind).toBe("effect");
    h.accept(0);
    expect(h.state.players[1].life.length).toBe(2);
    expect(h.choice).toBeUndefined();
  });
});

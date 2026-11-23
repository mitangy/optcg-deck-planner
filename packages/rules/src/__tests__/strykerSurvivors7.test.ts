import { describe, expect, it } from "vitest";
import { Harness } from "../testing/harness.js";

const SABO_LEADER = "ST13-001"; // red/yellow Leader, so the yellow Event below is playable
const FLAME_DRAGON_KING = "ST13-017"; // [Counter] +4000, then look at all your Life and reorder (no top-or-bottom option)
const MINOZEBRA = "OP03-068"; // vanilla 5000-power [Banish] Character
const LIFE = ["ST01-004", "ST01-005", "ST01-006"] as const;

describe("Banish trashes the Life card (R1)", () => {
  it("OP03-068 Minozebra's Banish hit sends the top Life card to the trash, not to the hand (#PRNUM)", () => {
    const h = new Harness();
    h.life(1, ...LIFE);
    const [attacker] = h.field(0, MINOZEBRA);
    h.attack(attacker!, "leader");
    h.passBattle();
    expect(h.state.players[1].life).toEqual(["ST01-005", "ST01-006"]);
    expect(h.state.players[1].trash).toEqual(["ST01-004"]);
    expect(h.state.players[1].hand).toEqual([]);
  });
});

describe("reordering Life without the top-or-bottom option (R2)", () => {
  function flameDragonKing() {
    const h = new Harness({ leaders: ["ST01-001", SABO_LEADER] });
    h.life(1, ...LIFE);
    h.hand(1, FLAME_DRAGON_KING);
    h.don(1, 2);
    h.act(0, { type: "declare_attack", attackerId: h.state.players[0].leader.id, target: { kind: "leader" } });
    h.act(1, { type: "pass_block" });
    h.act(1, { type: "counter_event", handIndex: 0 });
    if (h.choice?.request?.type !== "order") h.accept();
    expect(h.choice!.request).toMatchObject({ type: "order", allowTopOrBottom: false });
    return h;
  }
  const lifeOf = (h: Harness) => h.state.players[1].life;

  it("ST13-017 Flame Dragon King rejects a bottom placement and leaves the Life order unchanged (#PRNUM)", () => {
    const h = flameDragonKing();
    const r = h.try(1, { type: "resolve_pending_choice", accept: true, orderedOptionIds: ["o0", "o1", "o2"], topOptionIds: ["o0", "o1", "o2"] });
    expect(r.ok).toBe(false);
    expect(r.error?.message).toBe("This effect does not allow bottom placement");
    expect(h.choice).toBeDefined();
    expect(lifeOf(h)).toEqual([...LIFE]);
  });

  it("ST13-017 Flame Dragon King accepts a plain order and puts the Life cards back in that order (#PRNUM)", () => {
    const h = flameDragonKing();
    h.act(1, { type: "resolve_pending_choice", accept: true, orderedOptionIds: ["o2", "o0", "o1"] });
    expect(h.choice).toBeUndefined();
    expect(lifeOf(h)).toEqual(["ST01-006", "ST01-004", "ST01-005"]);
  });
});

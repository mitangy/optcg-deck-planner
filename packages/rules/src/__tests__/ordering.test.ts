/**
 * Timing and interaction ordering: who resolves first, what a replaced event
 * still triggers, how K.O. chains and "you may ... if you do" gates unfold, and
 * what resolves while a choice is paused. Each test names a real card whose
 * printed text exercises the rule.
 */
import { describe, expect, it } from "vitest";
import { costOf } from "../engine/queries.js";
import { FILLER, Harness } from "../testing/harness.js";

describe("simultaneous triggers", () => {
  it("resolves the turn player's [When Attacking] before the defender's [On Your Opponent's Attack] (OP02-034, OP07-010)", () => {
    const h = new Harness();
    const [chopper] = h.field(0, "OP02-034");
    h.attach(0, chopper!, 1);
    h.field(1, "OP07-010", FILLER);
    h.hand(1, FILLER);
    h.attack(chopper!, "leader");
    expect(h.choice?.seat).toBe(0);
    expect(h.choice?.cardDefId).toBe("OP02-034");
    h.pick(FILLER);
    expect(h.choice?.seat).toBe(1);
    expect(h.choice?.cardDefId).toBe("OP07-010");
    expect(h.state.players[1].characters.map((c) => c.rested)).toEqual([false, true]);
  });

  it("lets a player order their own simultaneous triggers (OP07-010, OP09-023)", () => {
    const h = new Harness();
    h.field(1, "OP07-010", "OP09-023");
    h.hand(1, FILLER);
    h.don(1, 2);
    h.attack(h.state.players[0].leader, "leader");
    expect(h.choice?.kind).toBe("order_effects");
    const ids = h.choice!.unorderedChoices!.map((c) => [c.cardDefId, c.id] as const);
    expect(ids.map(([d]) => d)).toEqual(["OP07-010", "OP09-023"]);
    h.act(1, { type: "order_pending_effects", orderedIds: [ids[1]![1], ids[0]![1]] });
    expect(h.choice?.cardDefId).toBe("OP09-023");
    h.decline(1);
    expect(h.choice?.cardDefId).toBe("OP07-010");
  });

  it("fires a [Once Per Turn] trigger once when two Characters are K.O.'d together (EB01-047 Laboon, OP16-011 Vista)", () => {
    const h = new Harness();
    const [vista] = h.field(0, "OP16-011");
    h.attach(0, vista!, 1);
    const [a, b] = h.field(1, "EB01-017", "EB01-017");
    h.field(1, "EB01-047");
    h.hand(1, FILLER);
    const deckBefore = h.state.players[1].deck.length;
    h.attack(vista!, "leader");
    h.pick(a!.id, b!.id);
    // The one Laboon is queued once per K.O. and asks for an order.
    h.act(1, { type: "order_pending_effects", orderedIds: h.choice!.unorderedChoices!.map((c) => c.id) });
    while (h.choice) h.pick(FILLER);
    expect(h.state.players[1].characters.map((c) => c.defId)).toEqual(["EB01-047"]);
    expect(h.state.players[1].deck.length).toBe(deckBefore - 1);
  });
});

describe("K.O. chains", () => {
  it("fires the [On K.O.] of a Character K.O.'d by another [On K.O.] (OP01-007 Caribou, OP01-080 Zala)", () => {
    const h = new Harness();
    const [caribou] = h.field(1, "OP01-007");
    caribou!.rested = true;
    const [zala] = h.field(0, "OP01-080");
    h.attack(h.state.players[0].leader, caribou!).passBattle();
    expect(h.choice?.seat).toBe(1);
    h.pick(zala!.id);
    expect(h.choice).toBeUndefined();
    expect(h.state.players[1].trash).toEqual(["OP01-007"]);
    expect(h.state.players[0].characters).toEqual([]);
    expect(h.state.players[0].trash).toEqual(["OP01-080"]);
    expect(h.state.players[0].hand.map((c) => c.defId)).toEqual([FILLER]);
  });
});

describe("replacement effects", () => {
  const setup = () => {
    const h = new Harness();
    const [vista] = h.field(0, "OP16-011");
    h.attach(0, vista!, 1);
    const [marco, valentine] = h.field(1, "OP16-014", "EB03-047");
    h.deckTop(1, FILLER);
    h.attack(vista!, "leader");
    h.pick(valentine!.id);
    expect(h.choice?.request?.type).toBe("confirm");
    return { h, marco: marco!, valentine: valentine! };
  };

  it("an accepted replacement K.O.s Marco once and the protected Character's [On K.O.] never fires (OP16-014, EB03-047)", () => {
    const { h } = setup();
    h.accept(1);
    expect(h.state.players[1].characters.map((c) => c.defId)).toEqual(["EB03-047"]);
    expect(h.state.players[1].trash).toEqual(["OP16-014"]);
    expect(h.state.players[1].hand).toEqual([]);
  });

  it("a declined replacement lets the Character be K.O.'d and its [On K.O.] fire (OP16-014, EB03-047)", () => {
    const { h } = setup();
    h.decline(1);
    expect(h.state.players[1].characters.map((c) => c.defId)).toEqual(["OP16-014"]);
    expect(h.state.players[1].trash).toEqual(["EB03-047"]);
    expect(h.state.players[1].hand.map((c) => c.defId)).toEqual([FILLER]);
  });
});

describe("\"you may ... if you do\"", () => {
  const setup = () => {
    const h = new Harness();
    h.hand(0, "P-046", FILLER, "ST01-014");
    h.don(0, 1);
    h.deckTop(0, "OP01-001", "OP01-004");
    h.play(0, "P-046");
    return h;
  };

  it("accepting places the hand on the bottom and draws that many (P-046 Yamato)", () => {
    const h = setup();
    h.accept(0);
    expect(h.choice).toBeUndefined();
    expect(h.state.players[0].hand.map((c) => c.defId)).toEqual(["OP01-001", "OP01-004"]);
    expect(h.state.players[0].deck.slice(-2)).toEqual([FILLER, "ST01-014"]);
  });

  it("declining keeps the hand and draws nothing (P-046 Yamato)", () => {
    const h = setup();
    h.decline(0);
    expect(h.choice).toBeUndefined();
    expect(h.state.players[0].hand.map((c) => c.defId)).toEqual([FILLER, "ST01-014"]);
    expect(h.state.players[0].deck[0]).toBe("OP01-001");
  });
});

describe("battle timing", () => {
  it("resolves [When Attacking] before the defender can block, so a rested Blocker cannot block (OP02-034 Chopper, OP02-012 Blenheim)", () => {
    const h = new Harness();
    const [chopper] = h.field(0, "OP02-034");
    h.attach(0, chopper!, 1);
    const [blenheim] = h.field(1, "OP02-012");
    h.attack(chopper!, "leader");
    expect(h.choice?.cardDefId).toBe("OP02-034");
    expect(h.try(1, { type: "declare_block", blockerId: blenheim!.id }).ok).toBe(false);
    h.pick(blenheim!.id);
    expect(h.find(1, "OP02-012")!.rested).toBe(true);
    expect(h.legal(1).some((i) => i.type === "declare_block")).toBe(false);
    expect(h.legal(1).some((i) => i.type === "pass_block")).toBe(true);
  });

  it("resolves [On Block] before the counter step (OP02-110 Hina)", () => {
    const h = new Harness();
    const [attacker] = h.field(0, FILLER);
    h.field(1, "OP02-110");
    h.attack(attacker!, "leader");
    h.act(1, { type: "declare_block", blockerId: h.find(1, "OP02-110")!.id });
    expect(h.choice?.cardDefId).toBe("OP02-110");
    expect(h.state.phase).toBe("block");
    h.pick(attacker!.id);
    expect(h.state.phase).toBe("counter");
  });
});

describe("DON!! given by the rules", () => {
  it("giving DON!! in the Main Phase fires \"when given a DON!! card\" (OP02-002 Garp)", () => {
    const h = new Harness({ leaders: ["OP02-002", "ST01-001"] });
    const [target] = h.field(1, "OP01-110");
    const [mine] = h.field(0, FILLER);
    h.don(0, 2);
    const don = h.state.players[0].costArea[0]!;
    h.act(0, { type: "give_don", donId: don.id, targetId: mine!.id });
    h.pick(target!.id);
    expect(costOf(h.state, 1, h.find(1, "OP01-110")!)).toBe(5);
  });
});

describe("paused choices", () => {
  it("blocks every other action until the choice is answered (OP02-034 Chopper)", () => {
    const h = new Harness();
    const [chopper] = h.field(0, "OP02-034");
    h.attach(0, chopper!, 1);
    h.field(1, FILLER);
    h.attack(chopper!, "leader");
    const before = JSON.stringify(h.state);
    expect(h.try(0, { type: "end_turn" }).ok).toBe(false);
    expect(h.try(1, { type: "pass_block" }).ok).toBe(false);
    expect(h.try(1, { type: "resolve_pending_choice", accept: true, selectedOptionIds: [] }).ok).toBe(false);
    expect(JSON.stringify(h.state)).toBe(before);
    expect(h.legal(1)).toEqual([]);
  });
});

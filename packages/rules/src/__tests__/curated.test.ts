/**
 * Regression fixtures for the originally curated cards, now driven entirely by
 * generated definitions from official text (no card-specific engine code).
 */
import { describe, expect, it } from "vitest";
import { FILLER, Harness } from "../testing/harness.js";

describe("OP16-080 Marshall.D.Teach (Leader)", () => {
  it("raises your Characters' cost during the opponent's turn only", () => {
    const h = new Harness({ leaders: ["OP16-080", "ST01-001"] });
    h.field(0, FILLER);
    expect(h.view(0).you.characters[0]!.fieldCost).toBe(1);
    h.act(0, { type: "end_turn" });
    expect(h.view(0).you.characters[0]!.fieldCost).toBe(2);
  });

  it("may trash a [Trigger] card to redirect an attack to a Blackbeard Pirates Character", () => {
    const h = new Harness({ leaders: ["ST01-001", "OP16-080"] });
    const [bb] = h.field(1, "OP09-095");
    h.hand(1, "ST01-014");
    h.attack(h.state.players[0].leader, "leader");
    expect(h.choice?.seat).toBe(1);
    h.accept(1);
    h.pick(bb!.id);
    expect(h.state.battle?.target).toEqual({ kind: "character", instanceId: bb!.id });
    expect(h.state.players[1].trash).toContain("ST01-014");
  });

  it("offers nothing without a [Trigger] card in hand", () => {
    const h = new Harness({ leaders: ["ST01-001", "OP16-080"] });
    h.hand(1, FILLER);
    h.attack(h.state.players[0].leader, "leader");
    expect(h.choice).toBeUndefined();
    expect(h.state.phase).toBe("block");
  });
});

describe("OP09-118 Gol.D.Roger", () => {
  it("has Rush and wins when the opponent activates Blocker while a player has 0 Life", () => {
    const h = new Harness();
    h.hand(0, "OP09-118");
    h.don(0, 10);
    h.play(0, "OP09-118");
    const roger = h.find(0, "OP09-118")!;
    h.field(1, "ST01-006");
    h.life(1);
    h.attack(roger, "leader");
    h.act(1, { type: "declare_block", blockerId: h.state.players[1].characters[0]!.id });
    expect(h.state.winner).toBe(0);
    expect(h.state.winReason).toBe("card_effect");
  });

  it("does not win while both players have Life", () => {
    const h = new Harness();
    const [roger] = h.field(0, "OP09-118");
    const [blocker] = h.field(1, "ST01-006");
    h.attack(roger!, "leader");
    h.act(1, { type: "declare_block", blockerId: blocker!.id });
    expect(h.state.winner).toBeNull();
  });
});

describe("OP16-118 Portgas.D.Ace", () => {
  it("sets the hand Counter of 8000-power Characters to +2000 while on the field", () => {
    const h = new Harness();
    const [target] = h.field(1, FILLER);
    target!.rested = true;
    h.field(1, "OP16-118");
    h.hand(1, "OP16-014");
    h.attack(h.state.players[0].leader, target!);
    h.act(1, { type: "pass_block" });
    expect(h.legal(1)).toContainEqual({ type: "counter_from_hand", handIndex: 0 });
    h.act(1, { type: "counter_from_hand", handIndex: 0 });
    expect(h.view(1).you.characters[0]!.power).toBe(5000);
  });

  it("shows the defender the live +2000 hand Counter, not the printed +1000", () => {
    const h = new Harness();
    h.field(1, "OP16-118");
    h.hand(1, "OP16-005");
    h.hand(1, "OP16-005");
    h.attack(h.state.players[0].leader, "leader");
    h.act(1, { type: "pass_block" });
    expect(h.view(1).you.hand.map((c) => c.counter)).toEqual([2000, 2000]);
  });
});

describe("OP17-005 Edward.Newgate", () => {
  it("costs 4 less against a 10000-power Character and sets a monocolored Leader's base power", () => {
    const h = new Harness();
    h.hand(0, "OP17-005");
    const [big] = h.field(1, FILLER);
    expect(h.view(0).you.hand[0]!.playCost).toBe(10);
    h.state.modifiers.push({ id: "m_test", sourceSeat: 1, target: { kind: "card", id: big!.id }, effect: { type: "power", amount: 7000 }, expires: { kind: "permanent" } });
    expect(h.view(0).you.hand[0]!.playCost).toBe(6);
    h.don(0, 6);
    h.play(0, "OP17-005");
    expect(h.view(0).you.leader.power).toBe(8000);
    h.act(0, { type: "end_turn" });
    expect(h.view(0).you.leader.power).toBe(8000);
    h.act(1, { type: "end_turn" });
    expect(h.view(0).you.leader.power).toBe(5000);
  });
});

describe("OP17-112 Charlotte Linlin", () => {
  it("draws then offers a mode choice; its aura sets 4000-power Trigger Characters to 8000 on your turn", () => {
    const h = new Harness();
    h.hand(0, "OP17-112");
    h.don(0, 10);
    const [triggerChar] = h.field(0, "OP03-033");
    expect(h.view(0).you.characters[0]!.power).toBe(4000);
    h.play(0, "OP17-112");
    expect(h.choice?.request?.type).toBe("mode");
    h.pick("Add up to 1 card from the top of your deck to the top of your Life cards.");
    expect(h.state.players[0].life.length).toBe(6);
    expect(h.view(0).you.characters.find((c) => c.id === triggerChar!.id)!.power).toBe(8000);
    h.act(0, { type: "end_turn" });
    expect(h.view(1).opponent.characters.find((c) => c.id === triggerChar!.id)!.power).toBe(4000);
  });
});

describe("OP12-018 Color of the Supreme King Haki", () => {
  it("buffs, then optionally rests a DON!! to weaken the attacker's side", () => {
    const h = new Harness();
    const [target] = h.field(1, FILLER);
    target!.rested = true;
    h.hand(1, "OP12-018");
    h.don(1, 1);
    h.attack(h.state.players[0].leader, target!);
    h.act(1, { type: "pass_block" });
    h.act(1, { type: "counter_event", handIndex: 0 });
    h.pick(FILLER);
    h.accept(1);
    expect(h.state.players[1].costArea.every((d) => d.rested)).toBe(true);
    expect(h.view(0).you.leader.power).toBe(4000);
  });
});

describe("OP17-001 Edward.Newgate (Leader)", () => {
  it("trashes a card on the opponent's attack to give +4000 this battle", () => {
    const h = new Harness({ leaders: ["ST01-001", "OP17-001"] });
    h.hand(1, FILLER);
    h.attack(h.state.players[0].leader, "leader");
    h.accept(1);
    h.pick(h.state.players[1].leader.defId);
    expect(h.view(1).you.leader.power).toBe(9000);
    h.passBattle();
    expect(h.view(1).you.leader.power).toBe(5000);
    expect(h.state.players[1].life.length).toBe(5);
  });

  it("is offered again on a later attack in the same turn after being declined", () => {
    const h = new Harness({ leaders: ["ST01-001", "OP17-001"] });
    h.hand(1, FILLER, FILLER);
    const [attacker, second] = h.field(0, FILLER, FILLER);
    attacker!.summoningSick = false;
    second!.summoningSick = false;
    // First attack: decline the leader's [On Your Opponent's Attack] ability.
    h.attack(h.state.players[0].leader, "leader");
    expect(h.choice?.seat).toBe(1);
    expect(h.choice?.cardDefId).toBe("OP17-001");
    h.decline(1);
    h.passBattle();
    expect(h.state.players[1].life.length).toBe(4);
    expect(h.state.players[1].leader.usedAbilities?.["op17-001#0"]).toBeUndefined();
    // Second attack in the same turn: the ability must be offered again.
    h.attack(attacker!, "leader");
    expect(h.choice?.seat).toBe(1);
    expect(h.choice?.cardDefId).toBe("OP17-001");
    h.accept(1);
    h.pick(FILLER);
    h.pick(h.state.players[1].leader.defId);
    expect(h.view(1).you.leader.power).toBe(9000);
    h.passBattle();
    // Once actually used, it is not offered a third time this turn.
    expect(h.state.players[1].leader.usedAbilities?.["op17-001#0"]).toBe(h.state.turnNumber);
    h.attack(second!, "leader");
    expect(h.choice).toBeUndefined();
    expect(h.state.phase).toBe("block");
  });
});

describe("OP17-040 (Once Per Turn \"you may\" on leader attacked)", () => {
  it("declining the optional cost keeps the ability available for the next attack", () => {
    const h = new Harness({ leaders: ["ST01-001", "OP17-039"] });
    h.field(1, "OP17-040");
    const used = () => h.find(1, "OP17-040")!.usedAbilities?.["op17-040#m0"];
    h.hand(1, FILLER, FILLER);
    const [attacker] = h.field(0, FILLER);
    attacker!.summoningSick = false;
    h.attack(h.state.players[0].leader, "leader");
    expect(h.choice?.cardDefId).toBe("OP17-040");
    h.decline(1);
    h.passBattle();
    expect(used()).toBeUndefined();
    h.attack(attacker!, "leader");
    expect(h.choice?.cardDefId).toBe("OP17-040");
    h.accept(1);
    h.pick(FILLER);
    expect(h.view(1).you.leader.power).toBe(8000);
    expect(used()).toBe(h.state.turnNumber);
  });
});

describe("OP17-039 Rocks.D.Xebec (Leader)", () => {
  it("reveals the top card and draws two only for Rocks Pirates", () => {
    const h = new Harness({ leaders: ["OP17-039", "ST01-001"] });
    h.hand(0, FILLER);
    h.deckTop(0, "OP17-040");
    h.attack(h.state.players[0].leader, "leader");
    h.accept(0);
    expect(h.state.players[0].hand.length).toBe(2);
  });

  it("does not draw for other cards", () => {
    const h = new Harness({ leaders: ["OP17-039", "ST01-001"] });
    h.hand(0, FILLER);
    h.deckTop(0, FILLER);
    h.attack(h.state.players[0].leader, "leader");
    h.accept(0);
    expect(h.state.players[0].hand.length).toBe(0);
  });
});

describe("EB03-034 Charlotte Linlin", () => {
  it("On K.O. may return a DON!! to add the deck top to Life", () => {
    const h = new Harness();
    const [linlin] = h.field(1, "EB03-034");
    linlin!.rested = true;
    h.don(1, 3);
    h.attach(0, h.state.players[0].leader, 5);
    h.attack(h.state.players[0].leader, linlin!).passBattle();
    expect(h.choice?.seat).toBe(1);
    h.accept(1);
    // DON!! −1: choose which DON!! to return.
    h.act(1, { type: "resolve_pending_choice", accept: true, selectedOptionIds: ["o0"] });
    expect(h.state.players[1].life.length).toBe(6);
    expect(h.state.players[1].costArea.length).toBe(2);
  });
});

describe("OP15-061 Ohm", () => {
  it("DON!! −1 lets the player pick any DON!! on the field, including attached DON!!", () => {
    const h = new Harness();
    h.hand(0, "OP15-061");
    h.don(0, 3, 1);
    const leader = h.state.players[0].leader;
    h.attach(0, leader, 1);
    const handBefore = h.state.players[0].hand.length;
    h.play(0, "OP15-061");
    h.accept(0); // pay DON!! −1
    const req = h.choice?.request;
    expect(req?.type).toBe("select");
    if (req?.type !== "select") return;
    const labels = req.options.map((o) => o.label);
    expect(labels).toContain("Active DON!!");
    expect(labels).toContain("Rested DON!!");
    const attached = req.options.find((o) => o.label?.startsWith("DON!! on "));
    expect(attached).toBeDefined();
    const activeBefore = h.state.players[0].costArea.filter((d) => !d.rested).length;
    h.act(0, { type: "resolve_pending_choice", accept: true, selectedOptionIds: [attached!.id] });
    // The attached DON!! went back; active DON!! in the cost area were untouched.
    expect(h.state.players[0].leader.attachedDonIds).toHaveLength(0);
    expect(h.state.players[0].attachedDons).toHaveLength(0);
    expect(h.state.players[0].costArea.filter((d) => !d.rested).length).toBe(activeBefore);
    // Played Ohm (−1 card), then drew 1.
    expect(h.state.players[0].hand.length).toBe(handBefore);
  });
});

describe("OP15-066 Satori", () => {
  const A = "OP01-013";
  const B = "ST01-006";

  function lookAtTwo() {
    const h = new Harness();
    const [satori] = h.field(0, "OP15-066");
    h.don(0, 3);
    h.deckTop(0, A, B);
    h.attack(satori!, "leader");
    const r = h.choice?.request;
    expect(r?.type).toBe("look");
    if (r?.type !== "look") throw new Error("expected look prompt");
    expect(r.rest).toBe("top_or_bottom");
    expect(r.options.map((o) => o.defId)).toEqual([A, B]);
    const opt = (defId: string) => r.options.find((o) => o.defId === defId)!.id;
    return { h, opt, deckSize: h.state.players[0].deck.length };
  }

  it("places both on top in the chosen order", () => {
    const { h, opt } = lookAtTwo();
    h.act(0, { type: "resolve_pending_choice", accept: true, selectedOptionIds: [], orderedOptionIds: [opt(B), opt(A)], topOptionIds: [opt(B), opt(A)] });
    expect(h.state.players[0].deck.slice(0, 2)).toEqual([B, A]);
  });

  it("rejects splitting one to the top and one to the bottom", () => {
    const { h, opt } = lookAtTwo();
    const r = h.try(0, { type: "resolve_pending_choice", accept: true, selectedOptionIds: [], orderedOptionIds: [opt(A), opt(B)], topOptionIds: [opt(B)] });
    expect(r.ok).toBe(false);
    expect(r.error?.message).toMatch(/same side/);
  });

  it("places both on the bottom in the chosen order (first listed sits higher)", () => {
    const { h, opt } = lookAtTwo();
    h.act(0, { type: "resolve_pending_choice", accept: true, selectedOptionIds: [], orderedOptionIds: [opt(B), opt(A)], topOptionIds: [] });
    expect(h.state.players[0].deck.slice(-2)).toEqual([B, A]);
  });

  it("skips the look with 7+ DON!! on the field", () => {
    const h = new Harness();
    const [satori] = h.field(0, "OP15-066");
    h.don(0, 7);
    h.attack(satori!, "leader");
    expect(h.choice?.request?.type).not.toBe("look");
  });
});

describe("OP15-020 Fire Fist", () => {
  function castOnZeroPower() {
    const h = new Harness();
    const [target] = h.field(1, FILLER);
    h.hand(0, "OP15-020", FILLER, FILLER, FILLER);
    h.don(0, 10);
    h.play(0, "OP15-020");
    h.pick(target!.id);
    return { h, target: target! };
  }

  it("asks whether to trash 2 cards for the K.O., and declining leaves the 0-power Character alive", () => {
    const { h, target } = castOnZeroPower();
    expect(h.choice?.request?.type).toBe("confirm");
    expect(h.choice?.prompt).toContain("trash 2 cards from your hand, and if you do, KO");
    h.decline(0);
    expect(h.choice).toBeUndefined();
    expect(h.state.players[0].hand).toHaveLength(3);
    expect(h.state.players[1].characters.map((c) => c.id)).toEqual([target.id]);
    expect(h.view(1).you.characters[0]!.power).toBeLessThanOrEqual(0);
  });

  it("trashing 2 cards K.O.s the 0-power Character", () => {
    const { h, target } = castOnZeroPower();
    h.accept(0);
    h.pick(FILLER, FILLER);
    h.pick(target.id);
    expect(h.state.players[0].hand).toHaveLength(1);
    expect(h.state.players[1].characters).toHaveLength(0);
  });
});

describe("OP15-020 Fire Fist without 2 cards to trash", () => {
  it("does not offer the trash, so 1 card in hand stays and the 0-power Character survives", () => {
    const h = new Harness();
    const [target] = h.field(1, FILLER);
    h.hand(0, "OP15-020", FILLER);
    h.don(0, 10);
    h.play(0, "OP15-020");
    h.pick(target!.id);
    expect(h.choice).toBeUndefined();
    expect(h.state.players[0].hand).toHaveLength(1);
    expect(h.state.players[1].characters).toHaveLength(1);
  });
});

describe("OP09-103 Koala", () => {
  function playKoala(playSabo: boolean) {
    const h = new Harness();
    h.hand(0, "OP09-103", "EB02-002");
    h.don(0, 10);
    h.play(0, "OP09-103");
    h.accept(0);
    h.pick("Top");
    if (playSabo) h.pick("EB02-002"); else h.decline(0);
    return h;
  }

  it("draws 1 after playing a Revolutionary Army Character", () => {
    const h = playKoala(true);
    expect(h.find(0, "EB02-002")).toBeDefined();
    expect(h.state.players[0].hand).toHaveLength(2);
  });

  it("does not draw when nothing is played", () => {
    const h = playKoala(false);
    expect(h.state.players[0].hand).toHaveLength(2); // the Life card and the unplayed Sabo, no draw
  });
});

describe("OP13-119 (you may return up to 1; if you do, the opponent plays)", () => {
  it("accepting but returning nothing does not let the opponent play", () => {
    const h = new Harness();
    h.field(1, FILLER);
    h.hand(1, FILLER);
    h.hand(0, "OP13-119");
    h.don(0, 10);
    h.play(0, "OP13-119");
    while (h.choice && h.choice.request?.type !== "confirm") h.decline(h.choice.seat);
    h.accept(0);
    h.decline(0);
    expect(h.choice).toBeUndefined();
    expect(h.state.players[1].hand).toHaveLength(1);
  });
});

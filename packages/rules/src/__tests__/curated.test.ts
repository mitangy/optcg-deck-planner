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
    expect(h.state.players[1].life.length).toBe(6);
    expect(h.state.players[1].costArea.length).toBe(2);
  });
});

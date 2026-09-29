/**
 * One real card per DSL primitive, asserting the concrete state change so a
 * silently ignored operation fails loudly (the fuzzer cannot detect no-ops).
 */
import { describe, expect, it } from "vitest";
import { FILLER, Harness } from "../testing/harness.js";

describe("zone movement primitives", () => {
  it("mill: OP06-089 trashes three from the deck top on play", () => {
    const h = new Harness();
    h.hand(0, "OP06-089");
    h.don(0, 2);
    const before = h.state.players[0].deck.length;
    h.play(0, "OP06-089");
    expect(h.state.players[0].deck.length).toBe(before - 3);
    expect(h.state.players[0].trash.length).toBe(3);
  });

  it("draw + discard: EB04-027 draws two then trashes one chosen card", () => {
    const h = new Harness();
    h.hand(0, "EB04-027");
    h.don(0, 5);
    h.play(0, "EB04-027");
    expect(h.state.players[0].hand.length).toBe(2);
    expect(h.choice?.request?.type).toBe("select");
    h.pick(h.state.players[0].hand[0]!.defId);
    expect(h.state.players[0].hand.length).toBe(1);
    expect(h.state.players[0].trash.length).toBe(1);
  });

  it("set power: OP07-002 sets an opposing Character's power to 0 for the turn", () => {
    const h = new Harness();
    h.hand(0, "OP07-002");
    h.don(0, 7);
    const [victim] = h.field(1, FILLER);
    h.play(0, "OP07-002");
    h.pick(victim!.id);
    expect(h.view(0).opponent.characters[0]!.power).toBe(0);
    h.act(0, { type: "end_turn" });
    expect(h.view(1).you.characters[0]!.power).toBe(3000);
  });

  it("restriction: OP05-042 stops a Character from attacking until your next turn", () => {
    const h = new Harness();
    h.hand(0, "OP05-042");
    h.don(0, 6);
    const [victim] = h.field(1, FILLER);
    h.play(0, "OP05-042");
    h.pick(victim!.id);
    h.act(0, { type: "end_turn" });
    expect(h.legal(1).some((i) => i.type === "declare_attack" && i.attackerId === victim!.id)).toBe(false);
    h.act(1, { type: "end_turn" });
    h.act(0, { type: "end_turn" });
    expect(h.legal(1).some((i) => i.type === "declare_attack" && i.attackerId === victim!.id)).toBe(true);
  });
});

describe("DON!! primitives", () => {
  it("On Block cost + add DON!!: OP10-077 rests two DON!! to add one active", () => {
    const h = new Harness();
    const [bellamy] = h.field(1, "OP10-077");
    h.don(1, 2);
    h.attack(h.state.players[0].leader, "leader");
    h.act(1, { type: "declare_block", blockerId: bellamy!.id });
    h.accept(1);
    const p = h.state.players[1];
    expect(p.costArea.length).toBe(3);
    expect(p.costArea.filter((d) => d.rested).length).toBe(2);
  });

  it("End of Your Turn: OP02-029 sets a DON!! active", () => {
    const h = new Harness();
    h.field(0, "OP02-029");
    h.don(0, 0, 2);
    h.act(0, { type: "end_turn" });
    expect(h.state.players[0].costArea.filter((d) => !d.rested).length).toBe(1);
  });

  it("delayed effect and no-refresh: EB02-015", () => {
    const h = new Harness();
    h.hand(0, "EB02-015");
    h.don(0, 7);
    const [victim] = h.field(1, FILLER);
    victim!.rested = true;
    h.play(0, "EB02-015");
    h.pick(victim!.id);
    expect(h.state.delayed.length).toBe(1);
    expect(h.state.players[0].costArea.filter((d) => !d.rested).length).toBe(0);
    h.act(0, { type: "end_turn" });
    // The delayed effect set one DON!! active at the end of the turn; the victim stayed rested.
    expect(h.state.players[1].characters[0]!.rested).toBe(true);
    expect(h.state.delayed.length).toBe(0);
  });
});

describe("Life primitives", () => {
  it("look at Life and place it: EB02-053 can move the opponent's top Life to the bottom", () => {
    const h = new Harness();
    h.hand(0, "EB02-053");
    h.don(0, 3);
    h.life(1, "OP01-016", FILLER, FILLER);
    h.play(0, "EB02-053");
    h.pick("Opponent's Life");
    expect(h.choice?.request?.type).toBe("order");
    expect(h.view(1).pendingChoices[0]?.request && "options" in h.view(1).pendingChoices[0]!.request! ? (h.view(1).pendingChoices[0]!.request as { options: { defId?: string }[] }).options[0]!.defId : "HIDDEN").toBe("HIDDEN");
    h.act(0, { type: "resolve_pending_choice", accept: true, orderedOptionIds: ["o0"], topOptionIds: [] });
    expect(h.state.players[1].life).toEqual([FILLER, FILLER, "OP01-016"]);
  });

  it("effect damage with Triggers: EB03-055 On K.O. during the opponent's turn deals 1 damage", () => {
    const h = new Harness();
    const [robin] = h.field(1, "EB03-055");
    robin!.rested = true;
    h.life(0, "ST01-014", FILLER);
    h.attach(0, h.state.players[0].leader, 4);
    h.attack(h.state.players[0].leader, robin!).passBattle();
    // Opponent's turn from Robin's controller's view: On K.O. may deal 1 damage.
    expect(h.choice?.seat).toBe(1);
    h.accept(1);
    expect(h.choice?.kind).toBe("life_trigger");
    h.decline(0);
    expect(h.state.players[0].life).toEqual([FILLER]);
    expect(h.state.players[0].hand.map((c) => c.defId)).toContain("ST01-014");
  });
});

describe("protection and replacement", () => {
  it("OP03-032 cannot be K.O.'d in battle by <Slash> attackers only", () => {
    const slash = new Harness({ leaders: ["OP01-001", "ST01-001"] });
    const [buggy] = slash.field(1, "OP03-032");
    buggy!.rested = true;
    slash.attach(0, slash.state.players[0].leader, 2);
    slash.attack(slash.state.players[0].leader, buggy!).passBattle();
    expect(slash.state.players[1].characters.length).toBe(1);
    const strike = new Harness();
    const [buggy2] = strike.field(1, "OP03-032");
    buggy2!.rested = true;
    strike.attach(0, strike.state.players[0].leader, 2);
    strike.attack(strike.state.players[0].leader, buggy2!).passBattle();
    expect(strike.state.players[1].characters.length).toBe(0);
  });
});

describe("event triggers", () => {
  it("OP06-076 K.O.s when your DON!! is returned during your turn (after the current effect)", () => {
    const h = new Harness();
    h.field(0, "OP06-076");
    const [small] = h.field(1, FILLER);
    h.hand(0, "OP15-076");
    h.don(0, 3);
    h.play(0, "OP15-076");
    // Paying DON!! −1 returns a DON!! (player picks which); Kiten's own effect resolves first.
    h.accept(0);
    expect(h.choice?.prompt).toMatch(/return to your DON!! deck/);
    h.act(0, { type: "resolve_pending_choice", accept: true, selectedOptionIds: ["o0"] });
    expect(h.choice?.prompt).toMatch(/-1000 power/);
    h.act(0, { type: "resolve_pending_choice", accept: true, selectedOptionIds: [] });
    expect(h.choice?.prompt).toMatch(/K.O./);
    h.pick(small!.id);
    expect(h.state.players[1].characters.some((c) => c.id === small!.id)).toBe(false);
  });

  it("OP04-086 draws after its battle K.O. with DON!! x1", () => {
    const h = new Harness();
    const [chinjao] = h.field(0, "OP04-086");
    h.attach(0, chinjao!, 1);
    const [victim] = h.field(1, FILLER);
    victim!.rested = true;
    h.attack(chinjao!, victim!).passBattle();
    // Drew two, then had to trash two (forced with an otherwise empty hand).
    expect(h.state.lastEvents.some((e) => e.type === "drew" && e.count === 2)).toBe(true);
    expect(h.state.players[0].trash.length).toBe(2);
  });

  it("OP03-015 Lim debuffs when K.O.'d during the opponent's turn", () => {
    const h = new Harness();
    const [lim] = h.field(1, "OP03-015");
    lim!.rested = true;
    h.attack(h.state.players[0].leader, lim!).passBattle();
    expect(h.choice?.seat).toBe(1);
    h.pick(h.state.players[0].leader.id);
    expect(h.view(0).you.leader.power).toBe(3000);
  });
});

/**
 * Behavior fixtures for real cards, one per engine primitive family.
 * Card text comes from the official data; abilities from the generated registry.
 */
import { describe, expect, it } from "vitest";
import { FILLER, Harness } from "../testing/harness.js";

describe("On Play look (OP01-016 Nami)", () => {
  it("adds an eligible card privately and orders the rest to the bottom", () => {
    const h = new Harness();
    h.hand(0, "OP01-016");
    h.don(0, 1);
    h.deckTop(0, "OP01-016", "OP01-013", FILLER, "OP01-017", "OP01-025");
    h.play(0, "OP01-016");
    const r = h.choice!.request!;
    expect(r.type).toBe("look");
    if (r.type !== "look") return;
    // Another Nami is excluded by name; the Karoo filler lacks the trait.
    expect(r.options.map((o) => o.eligible)).toEqual([false, true, false, true, true]);
    const rejected = h.try(0, { type: "resolve_pending_choice", accept: true, selectedOptionIds: ["o0"], orderedOptionIds: ["o1", "o2", "o3", "o4"] });
    expect(rejected.ok).toBe(false);
    h.act(0, { type: "resolve_pending_choice", accept: true, selectedOptionIds: ["o3"], orderedOptionIds: ["o4", "o2", "o1", "o0"] });
    expect(h.state.players[0].hand.map((c) => c.defId)).toEqual(["OP01-017"]);
    expect(h.state.players[0].deck.slice(-4)).toEqual(["OP01-025", FILLER, "OP01-013", "OP01-016"]);
  });

  it("allows taking nothing and requires every remaining card in the order", () => {
    const h = new Harness();
    h.hand(0, "OP01-016");
    h.don(0, 1);
    h.deckTop(0, FILLER, FILLER);
    h.state.players[0].deck.splice(2);
    h.state.players[0].zoneInstanceIds.deck.splice(2);
    h.deckTop(0);
    // Two-card deck: look sees only two cards.
    h.play(0, "OP01-016");
    expect(h.try(0, { type: "resolve_pending_choice", accept: true, selectedOptionIds: [], orderedOptionIds: ["o0"] }).ok).toBe(false);
    h.act(0, { type: "resolve_pending_choice", accept: true, selectedOptionIds: [], orderedOptionIds: ["o1", "o0"] });
    expect(h.state.players[0].deck.length).toBe(2);
  });
});

describe("Counter events and Life Triggers (ST01-014 Guard Point)", () => {
  it("resolves the [Counter] with a chosen target, then trashes the Event", () => {
    const h = new Harness();
    const [karoo] = h.field(1, FILLER);
    karoo!.rested = true;
    h.hand(1, "ST01-014");
    h.don(1, 1);
    h.attack(h.state.players[0].leader, karoo!);
    h.act(1, { type: "pass_block" });
    h.act(1, { type: "counter_event", handIndex: 0 });
    expect(h.choice?.request?.type).toBe("select");
    h.pick(FILLER);
    expect(h.view(1).you.characters[0]!.power).toBe(6000);
    expect(h.state.players[1].trash).toContain("ST01-014");
    h.act(1, { type: "pass_counter" });
    expect(h.state.players[1].characters.length).toBe(1);
    // "During this battle" expires with the battle.
    expect(h.view(1).you.characters[0]!.power).toBe(3000);
  });

  it("offers the [Trigger] from Life; accepting resolves it and trashes the card", () => {
    const h = new Harness();
    h.life(1, "ST01-014", FILLER);
    h.attack(h.state.players[0].leader, "leader").passBattle();
    expect(h.choice?.kind).toBe("life_trigger");
    expect(h.view(0).pendingChoices[0]!.cardDefId).toBe("HIDDEN");
    h.accept(1);
    h.pick(h.state.players[1].leader.defId);
    expect(h.view(1).you.leader.power).toBe(6000);
    expect(h.state.players[1].trash).toContain("ST01-014");
    expect(h.state.players[1].hand.length).toBe(0);
  });

  it("declining a [Trigger] adds the card to hand", () => {
    const h = new Harness();
    h.life(1, "ST01-014", FILLER);
    h.attack(h.state.players[0].leader, "leader").passBattle();
    h.decline(1);
    expect(h.state.players[1].hand.map((c) => c.defId)).toEqual(["ST01-014"]);
    expect(h.state.phase).toBe("main");
  });
});

describe("keywords and statics", () => {
  it("ST01-004 Sanji has Rush only with two DON!! attached", () => {
    const h = new Harness();
    h.hand(0, "ST01-004");
    h.don(0, 4);
    h.play(0, "ST01-004");
    const sanji = h.find(0, "ST01-004")!;
    expect(h.legal(0).some((i) => i.type === "declare_attack" && i.attackerId === sanji.id)).toBe(false);
    const dons = h.state.players[0].costArea.filter((d) => !d.rested);
    h.act(0, { type: "give_don", donId: dons[0]!.id, targetId: sanji.id });
    h.act(0, { type: "give_don", donId: dons[1]!.id, targetId: sanji.id });
    expect(h.legal(0).some((i) => i.type === "declare_attack" && i.attackerId === sanji.id)).toBe(true);
  });

  it("OP01-001 Zoro Leader aura applies with DON!! during your turn only", () => {
    const h = new Harness({ leaders: ["OP01-001", "ST01-001"] });
    h.field(0, FILLER);
    expect(h.view(0).you.characters[0]!.power).toBe(3000);
    h.attach(0, h.state.players[0].leader, 1);
    expect(h.view(0).you.characters[0]!.power).toBe(4000);
    h.act(0, { type: "end_turn" });
    expect(h.view(1).opponent.characters[0]!.power).toBe(3000);
  });

  it("ST23-001 Uta costs 4 less while you have a 10000-power Character", () => {
    const h = new Harness();
    h.hand(0, "ST23-001");
    expect(h.view(0).you.hand[0]!.playCost).toBe(6);
    const [big] = h.field(0, FILLER);
    h.attach(0, big!, 7);
    expect(h.view(0).you.hand[0]!.playCost).toBe(2);
  });
});

describe("When Attacking (ST01-005 Jinbe)", () => {
  it("buffs another friendly card when DON!! x1 is met", () => {
    const h = new Harness();
    const [jinbe] = h.field(0, "ST01-005");
    h.attach(0, jinbe!, 1);
    h.attack(jinbe!, "leader");
    expect(h.choice?.request?.type).toBe("select");
    const r = h.choice!.request!;
    if (r.type === "select") expect(r.options.some((o) => o.instanceId === jinbe!.id)).toBe(false);
    h.pick(h.state.players[0].leader.defId);
    expect(h.view(0).you.leader.power).toBe(6000);
  });

  it("does not trigger without DON!!", () => {
    const h = new Harness();
    const [jinbe] = h.field(0, "ST01-005");
    h.attack(jinbe!, "leader");
    expect(h.choice).toBeUndefined();
    expect(h.state.phase).toBe("block");
  });
});

describe("Activate: Main", () => {
  it("ST01-001 Luffy gives one rested DON!! once per turn", () => {
    const h = new Harness();
    h.don(0, 0, 2);
    const [karoo] = h.field(0, FILLER);
    const ability = h.legal(0).find((i) => i.type === "activate_ability");
    expect(ability).toBeDefined();
    h.act(0, ability!);
    h.pick(FILLER);
    expect(karoo!.id && h.state.players[0].characters[0]!.attachedDonIds.length).toBe(1);
    expect(h.legal(0).some((i) => i.type === "activate_ability")).toBe(false);
  });

  it("OP09-095 Laffitte pays DON!! and rests itself to search", () => {
    const h = new Harness({ leaders: ["OP09-081", "ST01-001"] });
    const [laffitte] = h.field(0, "OP09-095");
    h.don(0, 1);
    h.deckTop(0, "OP09-093", FILLER, FILLER, FILLER, FILLER);
    h.act(0, { type: "activate_ability", sourceId: laffitte!.id, abilityId: "op09-095#0" });
    expect(h.state.players[0].characters[0]!.rested).toBe(true);
    expect(h.state.players[0].costArea.every((d) => d.rested)).toBe(true);
    h.act(0, { type: "resolve_pending_choice", accept: true, selectedOptionIds: ["o0"], orderedOptionIds: ["o1", "o2", "o3", "o4"] });
    expect(h.state.players[0].hand.map((c) => c.defId)).toEqual(["OP09-093"]);
    // Rested: cannot activate again.
    expect(h.legal(0).some((i) => i.type === "activate_ability" && i.sourceId === laffitte!.id)).toBe(false);
  });

  it("OP16-021 Moby Dick trashes itself as a cost", () => {
    const h = new Harness();
    h.stage(0, "OP16-021");
    h.don(0, 0, 1);
    h.act(0, { type: "activate_ability", sourceId: h.state.players[0].stage!.id, abilityId: "op16-021#1" });
    h.pick(h.state.players[0].leader.defId);
    expect(h.state.players[0].stage).toBeNull();
    expect(h.state.players[0].trash).toContain("OP16-021");
    expect(h.state.players[0].leader.attachedDonIds.length).toBe(1);
  });
});

describe("optional costs and K.O. (OP02-062 Luffy / OP01-006 Otama)", () => {
  it("asks before paying a trigger cost; declining skips the effect", () => {
    const h = new Harness();
    h.hand(0, "OP02-062", FILLER, FILLER);
    h.don(0, 6);
    h.field(1, FILLER);
    h.play(0, "OP02-062");
    expect(h.choice?.request?.type).toBe("confirm");
    h.decline(0);
    expect(h.state.players[0].hand.length).toBe(2);
    expect(h.state.players[1].characters.length).toBe(1);
  });

  it("paying the cost returns a Character and grants Double Attack", () => {
    const h = new Harness();
    h.hand(0, "OP02-062", FILLER, FILLER);
    h.don(0, 6);
    h.field(1, FILLER);
    h.play(0, "OP02-062");
    h.accept(0);

    h.pick(FILLER);
    expect(h.state.players[1].hand.map((c) => c.defId)).toEqual([FILLER]);
    const luffy = h.find(0, "OP02-062")!;
    expect(h.view(0).you.characters[0]!.keywords).toContain("double_attack");
    expect(luffy.summoningSick).toBe(true);
  });

  it("power reduction lasts for the turn", () => {
    const h = new Harness();
    h.hand(0, "OP01-006");
    h.don(0, 1);
    h.field(1, FILLER);
    h.play(0, "OP01-006");
    h.pick(FILLER);
    expect(h.view(0).opponent.characters[0]!.power).toBe(1000);
    h.act(0, { type: "end_turn" });
    expect(h.view(1).you.characters[0]!.power).toBe(3000);
  });
});

describe("replacement effects (OP16-014 Marco)", () => {
  it("offers to K.O. Marco instead when an opponent's effect would remove your Character", () => {
    const h = new Harness();
    h.field(1, "OP16-014", FILLER);
    h.hand(0, "OP02-062", FILLER, FILLER);
    h.don(0, 6);
    h.play(0, "OP02-062");
    h.accept(0);

    h.pick(FILLER);
    expect(h.choice?.seat).toBe(1);
    expect(h.choice?.request?.type).toBe("confirm");
    h.accept(1);
    expect(h.state.players[1].characters.map((c) => c.defId)).toEqual([FILLER]);
    expect(h.state.players[1].trash).toContain("OP16-014");
  });
});

describe("On K.O.", () => {
  it("OP16-014 Marco may replay itself by trashing an 8000-power Character", () => {
    const h = new Harness();
    const [marco] = h.field(1, "OP16-014");
    marco!.rested = true;
    h.hand(1, "OP01-110");
    h.attach(0, h.state.players[0].leader, 4);
    h.attack(h.state.players[0].leader, marco!).passBattle();
    expect(h.choice?.seat).toBe(1);
    h.accept(1);
    expect(h.state.players[1].characters.map((c) => c.defId)).toEqual(["OP16-014"]);
    expect(h.state.players[1].trash).toContain("OP01-110");
  });
});

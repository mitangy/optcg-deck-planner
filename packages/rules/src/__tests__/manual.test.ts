/**
 * Behavior checks for reviewed manual definitions and the primitives added for
 * them. Each test asserts a concrete state change so a silent no-op fails.
 */
import { describe, expect, it } from "vitest";
import { deckConstructionErrors } from "../cards/deckRules.js";
import { deserializeMatch, serializeMatch } from "../state/snapshot.js";
import { FILLER, Harness } from "../testing/harness.js";
import { costOf, keywordsOf, powerOf } from "../engine/queries.js";

describe("choose a cost and reveal (OP11-081)", () => {
  it("K.O.s when the revealed card has the chosen cost", () => {
    const h = new Harness();
    h.hand(0, "OP11-081");
    h.don(0, 6);
    const [victim] = h.field(1, FILLER);
    h.deckTop(1, FILLER);
    h.play(0, "OP11-081");
    expect(h.choice?.request?.type).toBe("mode");
    h.pick("1");
    h.pick(victim!.id);
    expect(h.state.players[1].characters.length).toBe(0);
  });

  it("does nothing when the guess is wrong", () => {
    const h = new Harness();
    h.hand(0, "OP11-081");
    h.don(0, 6);
    h.field(1, FILLER);
    h.deckTop(1, FILLER);
    h.play(0, "OP11-081");
    h.pick("4");
    expect(h.choice).toBeUndefined();
    expect(h.state.players[1].characters.length).toBe(1);
  });
});

describe("DON!! primitives", () => {
  it("OP09-076 returns a chosen number of DON!! (1 or more) as its cost", () => {
    const h = new Harness();
    h.hand(0, "OP09-076");
    h.don(0, 5);
    h.play(0, "OP09-076");
    h.accept(0);
    expect(h.choice?.request?.type).toBe("select");
    h.pick("DON", "DON");
    const p = h.state.players[0];
    // 5 on field - 2 returned + 1 added active.
    expect(p.costArea.length).toBe(4);
    expect(p.costArea.filter((d) => !d.rested).length).toBe(3);
  });

  it("OP07-001 moves given DON!! from the Leader to a Character", () => {
    const h = new Harness({ leaders: ["OP07-001", "ST01-001"] });
    const [ally] = h.field(0, FILLER);
    const leader = h.state.players[0].leader;
    h.attach(0, leader, 2);
    h.act(0, { type: "activate_ability", sourceId: leader.id, abilityId: "op07-001#m0" });
    h.pick(leader.id);
    expect(ally!.attachedDonIds.length).toBe(0);
    const updated = h.state.players[0].characters[0]!;
    expect(updated.attachedDonIds.length).toBe(2);
    expect(h.state.players[0].leader.attachedDonIds.length).toBe(0);
  });

  it("OP06-020 can rest an opposing DON!! (DON!! or Character union)", () => {
    const h = new Harness({ leaders: ["OP06-020", "ST01-001"] });
    h.don(1, 2);
    h.act(0, { type: "activate_ability", sourceId: h.state.players[0].leader.id, abilityId: "op06-020#m0" });
    h.pick("DON");
    expect(h.state.players[1].costArea.filter((d) => d.rested).length).toBe(1);
  });

  it("OP15-010 gives an opponent's rested DON!! to one of their Characters", () => {
    const h = new Harness();
    const [nezumi] = h.field(0, "OP15-010");
    h.don(1, 0, 1);
    const [theirs] = h.field(1, FILLER);
    h.act(0, { type: "activate_ability", sourceId: nezumi!.id, abilityId: "op15-010#m0" });
    h.pick("Give your opponent's DON!! card to their Leader or Character");
    h.pick(theirs!.id);
    expect(h.state.players[1].characters[0]!.attachedDonIds.length).toBe(1);
    expect(h.state.players[1].costArea.length).toBe(0);
  });
});

describe("power and attack rules", () => {
  it("OP14-017 swaps the base power of two opposing Characters", () => {
    const h = new Harness();
    h.hand(0, "OP14-017");
    h.don(0, 3);
    const [small, big] = h.field(1, FILLER, "OP09-076");
    h.play(0, "OP14-017");
    const powers = Object.fromEntries(h.view(0).opponent.characters.map((c) => [c.id, c.power]));
    expect(powers[small!.id]).toBe(5000);
    expect(powers[big!.id]).toBe(3000);
  });

  it("P-067 while rested forces attacks onto itself", () => {
    const h = new Harness();
    const [attacker] = h.field(0, FILLER);
    const [kid, other] = h.field(1, "P-067", FILLER);
    kid!.rested = true;
    other!.rested = true;
    const attacks = h.legal(0).filter((i) => i.type === "declare_attack" && i.attackerId === attacker!.id);
    expect(attacks).toEqual([{ type: "declare_attack", attackerId: attacker!.id, target: { kind: "character", instanceId: kid!.id } }]);
  });

  it("OP13-064 negates non-Roger Pirates cards, removing [Blocker]", () => {
    const h = new Harness();
    const [chopper] = h.field(1, "ST01-006");
    h.attack(h.state.players[0].leader, "leader");
    expect(h.legal(1).some((i) => i.type === "declare_block" && i.blockerId === chopper!.id)).toBe(true);
    const g = new Harness();
    const [chopper2] = g.field(1, "ST01-006", "OP13-064");
    g.attack(g.state.players[0].leader, "leader");
    expect(g.legal(1).some((i) => i.type === "declare_block" && i.blockerId === chopper2!.id)).toBe(false);
  });
});

describe("player rules", () => {
  it("OP09-022 plays your Characters rested", () => {
    const h = new Harness({ leaders: ["OP09-022", "ST01-001"] });
    h.hand(0, FILLER);
    h.don(0, 1);
    h.play(0, FILLER);
    expect(h.state.players[0].characters[0]!.rested).toBe(true);
  });

  it("OP09-081 negates your own [On Play] effects", () => {
    const h = new Harness({ leaders: ["OP09-081", "ST01-001"] });
    h.hand(0, "OP06-089");
    h.don(0, 2);
    const before = h.state.players[0].deck.length;
    h.play(0, "OP06-089");
    expect(h.state.players[0].deck.length).toBe(before);
  });

  it("OP17-020 pays one of two alternative costs, then freezes a rested Character", () => {
    const h = new Harness({ leaders: ["OP17-020", "ST01-001"] });
    h.don(0, 1);
    const [victim] = h.field(1, FILLER);
    victim!.rested = true;
    h.act(0, { type: "activate_ability", sourceId: h.state.players[0].leader.id, abilityId: "op17-020#m0" });
    const request = h.choice?.request as { options: { label?: string; eligible: boolean }[] };
    expect(request.options.map((o) => o.eligible)).toEqual([false, true]);
    h.pick("Rest 1 of your DON!! cards");
    h.pick(victim!.id);
    expect(h.state.players[0].costArea.every((d) => d.rested)).toBe(true);
    h.act(0, { type: "end_turn" });
    expect(h.state.players[1].characters[0]!.rested).toBe(true);
  });

  it("OP15-022 loses only at the end of the turn its deck runs out", () => {
    const h = new Harness({ leaders: ["OP15-022", "ST01-001"] });
    const p = h.state.players[0];
    p.deck = [];
    p.zoneInstanceIds.deck = [];
    h.hand(0, FILLER);
    h.don(0, 1);
    h.play(0, FILLER);
    expect(h.state.winner).toBeNull();
    h.act(0, { type: "end_turn" });
    expect(h.state.winner).toBe(1);
  });

  it("ST13-003 sends face-up Life cards to the deck bottom when taking damage", () => {
    const h = new Harness({ leaders: ["ST01-001", "ST13-003"] });
    h.life(1, FILLER, FILLER);
    h.state.players[1].faceUpLife = [true, false];
    h.attach(0, h.state.players[0].leader, 1);
    const deckBefore = h.state.players[1].deck.length;
    h.attack(h.state.players[0].leader, "leader").passBattle();
    expect(h.state.players[1].life.length).toBe(1);
    expect(h.state.players[1].hand.length).toBe(0);
    expect(h.state.players[1].deck.length).toBe(deckBefore + 1);
  });

  it("deck-construction rules come from the Leader", () => {
    expect(deckConstructionErrors("OP12-001", ["OP09-076", "OP01-051"])).toEqual([expect.stringContaining("OP01-051")]);
    expect(deckConstructionErrors("OP12-001", ["OP09-076"])).toEqual([]);
    expect(deckConstructionErrors("ST01-001", ["OP01-051"])).toEqual([]);
  });
});

describe("attack tax (OP08-043)", () => {
  it("makes the opponent trash 2 cards to attack, and a paused tax survives a snapshot", () => {
    const h = new Harness({ leaders: ["OP17-001", "ST01-001"] });
    h.life(0, FILLER);
    h.hand(0, "OP08-043");
    h.don(0, 10);
    const [attacker] = h.field(1, FILLER);
    h.play(0, "OP08-043");
    h.act(0, { type: "end_turn" });
    h.hand(1, FILLER, FILLER, FILLER);
    const handBefore = h.state.players[1].hand.length;
    h.attack(attacker!, "leader");
    expect(h.choice?.request?.type).toBe("select");
    expect(() => deserializeMatch(serializeMatch(h.state))).not.toThrow();
    h.pick(FILLER, FILLER);
    expect(h.state.players[1].hand.length).toBe(handBefore - 2);
    expect(h.state.players[1].trash.filter((id) => id === FILLER).length).toBe(2);
  });
});

describe("granted replacement (EB02-030)", () => {
  it("lets a Character survive a battle K.O. by trashing a card", () => {
    const h = new Harness();
    const [target] = h.field(1, FILLER);
    target!.rested = true;
    h.hand(1, "EB02-030", FILLER);
    h.don(1, 2);
    h.attach(0, h.state.players[0].leader, 2);
    h.attack(h.state.players[0].leader, target!);
    h.act(1, { type: "pass_block" });
    h.act(1, { type: "counter_event", handIndex: 0 });
    h.act(1, { type: "pass_counter" });
    expect(h.choice?.seat).toBe(1);
    // One card left in hand, so the replacement's trash is forced once accepted.
    h.accept(1);
    expect(h.state.players[1].characters.length).toBe(1);
    expect(h.state.players[1].hand.length).toBe(0);
  });
});

describe("+cost statics feed cost conditions (OP17-119 Loki)", () => {
  it("Usopp OP17-080 gains power while another Character has a cost of 12 or more", () => {
    const h = new Harness();
    const [usopp] = h.field(0, "OP17-080");
    const base = powerOf(h.state, 0, usopp!);
    h.field(1, "OP17-119");
    expect(costOf(h.state, 1, h.state.players[1].characters[0]!)).toBe(18);
    expect(powerOf(h.state, 0, usopp!)).toBe(base + 3000);
  });
});

describe("conditional +cost statics (OP17 Elbaph)", () => {
  it("Gerd and Rodo gain +12 cost only while the Leader has the {Elbaph} type", () => {
    const elbaph = new Harness({ leaders: ["OP17-079", "ST01-001"] });
    const [gerd, rodo] = elbaph.field(0, "OP17-081", "OP17-094");
    expect(costOf(elbaph.state, 0, gerd!)).toBe(14);
    expect(costOf(elbaph.state, 0, rodo!)).toBe(13);
    const other = new Harness({ leaders: ["ST01-001", "ST01-001"] });
    const [g2] = other.field(0, "OP17-081");
    expect(costOf(other.state, 0, g2!)).toBe(2);
  });

  it("Luffy OP17-079 gives [Blocker] to a Character whose cost only reaches 12 through +cost", () => {
    const h = new Harness({ leaders: ["OP17-079", "ST01-001"] });
    const [saul, plain] = h.field(0, "OP17-089", FILLER);
    expect(keywordsOf(h.state, 0, saul!).has("blocker")).toBe(true);
    expect(keywordsOf(h.state, 0, plain!).has("blocker")).toBe(false);
  });

  it("Jinbe OP17-083 gains [Blocker] and power from an opposing Loki", () => {
    const h = new Harness();
    const [jinbe] = h.field(0, "OP17-083");
    const base = powerOf(h.state, 0, jinbe!);
    expect(keywordsOf(h.state, 0, jinbe!).has("blocker")).toBe(false);
    h.field(1, "OP17-119");
    expect(keywordsOf(h.state, 0, jinbe!).has("blocker")).toBe(true);
    expect(powerOf(h.state, 0, jinbe!)).toBe(base + 3000);
  });
});

describe("turning Life face-up as a cost (OP08-058 Pudding)", () => {
  it("is not offered when fewer than 2 Life cards are face-down", () => {
    const h = new Harness({ leaders: ["OP08-058", "ST01-001"] });
    h.life(0, FILLER, FILLER, FILLER, FILLER);
    h.state.players[0].faceUpLife = [true, true, true, false];
    h.attack(h.state.players[0].leader, "leader");
    expect(h.choice).toBeUndefined();
  });

  it("is offered with 2 face-down Life cards and adds a rested DON!!", () => {
    const h = new Harness({ leaders: ["OP08-058", "ST01-001"] });
    h.life(0, FILLER, FILLER, FILLER, FILLER);
    h.state.players[0].faceUpLife = [true, true, false, false];
    const before = h.state.players[0].costArea.length;
    h.attack(h.state.players[0].leader, "leader");
    h.accept();
    expect(h.state.players[0].faceUpLife).toEqual([true, true, true, true]);
    expect(h.state.players[0].costArea.length).toBe(before + 1);
  });
});

describe("turning Life face-down as a cost (OP08-063 Katakuri)", () => {
  it("is not offered when no Life card is face-up", () => {
    const h = new Harness();
    h.hand(0, "OP08-063");
    h.don(0, 7);
    h.life(0, FILLER, FILLER, FILLER);
    h.play(0, "OP08-063");
    expect(h.choice).toBeUndefined();
    expect(h.state.players[0].costArea.length).toBe(7);
  });

  it("turns a face-up Life card face-down and adds an active DON!!", () => {
    const h = new Harness();
    h.hand(0, "OP08-063");
    h.don(0, 7);
    h.life(0, FILLER, FILLER, FILLER);
    h.state.players[0].faceUpLife = [true, false, false];
    h.play(0, "OP08-063");
    h.accept();
    expect(h.state.players[0].faceUpLife).toEqual([false, false, false]);
    expect(h.state.players[0].costArea.length).toBe(8);
  });
});

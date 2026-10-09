/**
 * EB05 (Heroines Edition Vol. 2) cards, whose text comes from TCGPlayer until Bandai publishes it (#458).
 * Each row exercises a phrase the text compiler learned for these cards, with a row for the case where it
 * must not apply, so a grammar rule that is removed or loosened fails on its own scenario.
 */
import { describe, expect, it } from "vitest";
import { FILLER, Harness } from "../../testing/harness.js";
import { runScenarios, mine, type CardScenario } from "../../testing/scenario.js";

const KAROO = "ST01-003"; // vanilla 1-cost 3000
const BIG = "EB02-001"; // vanilla 5-cost 7000
const SHIRAHOSHI_LEADER = "OP11-022";
const WISDOM = "OP01-036"; // vanilla 3000, "Wisdom" attribute
const WISDOM_BLOCKER = "EB02-012"; // 1000, "Wisdom" attribute, [Blocker]
const RA_TRIGGER = "OP09-108"; // {Revolutionary Army} with a [Trigger]
const RA_PLAIN = "OP05-012"; // {Revolutionary Army}, no [Trigger]
const TRIGGER_OTHER = "OP01-037"; // not {Revolutionary Army}, has a [Trigger]
const STRIKE = "OP01-010"; // vanilla 3000, "Strike" attribute

const rows: CardScenario[] = [
  // EB05-020 My name is Shirahoshi!!: [Main] You may rest your Leader [Shirahoshi]: Draw 2 cards.
  {
    card: "EB05-020", name: "rests a [Shirahoshi] Leader to draw 2 cards (#458)",
    leaders: { me: SHIRAHOSHI_LEADER },
    me: { hand: ["EB05-020"], don: { active: 1 } },
    steps: [{ play: "EB05-020" }, { accept: true }],
    expect: { me: { hand: [FILLER, FILLER], deckDelta: -2 } },
  },
  {
    card: "EB05-020", name: "cannot pay with a Leader that is not [Shirahoshi] (#458)",
    me: { hand: ["EB05-020"], don: { active: 1 } },
    steps: [{ play: "EB05-020" }],
    expect: { me: { hand: [], deckDelta: 0 }, pending: "none" },
  },

  // EB05-028 Boa Hancock: [On Play] If your opponent has 9 or more cards in their hand, they trash 4 cards from their hand.
  {
    card: "EB05-028", name: "makes an opponent with 9 cards in hand trash 4 of them (#458)",
    me: { hand: ["EB05-028"], don: { active: 4 } },
    opp: { hand: [KAROO, KAROO, KAROO, KAROO, KAROO, KAROO, KAROO, KAROO, "EB02-001"] },
    steps: [{ play: "EB05-028" }, { pick: [KAROO, KAROO, KAROO, KAROO] }],
    expect: { opp: { hand: [KAROO, KAROO, KAROO, KAROO, "EB02-001"], trash: [KAROO, KAROO, KAROO, KAROO] } },
  },
  {
    card: "EB05-028", name: "does nothing to an opponent with 8 cards in hand (#458)",
    me: { hand: ["EB05-028"], don: { active: 4 } },
    opp: { hand: [KAROO, KAROO, KAROO, KAROO, KAROO, KAROO, KAROO, KAROO] },
    steps: [{ play: "EB05-028" }],
    expect: { opp: { trash: [] }, pending: "none" },
  },

  // EB05-008 Luffy, Now's Your Chance: [Counter] If you have no Characters with a cost of 5 or more,
  // up to 1 of your Leader or up to 1 of your Characters gains +4000 power during this battle.
  {
    card: "EB05-008", name: "Counter gives the Leader +4000 when no Character costs 5 or more (#458)",
    me: { field: [KAROO], don: { active: 1 } },
    opp: { hand: ["EB05-008"], field: [KAROO], don: { active: 1 } },
    steps: [{ attack: mine("ST01-001"), at: "leader" }, { passBlock: true }, { counter: "EB05-008" }, { pick: ["ST01-001"] }],
    expect: { opp: { power: { "ST01-001": 9000 } } },
  },
  {
    card: "EB05-008", name: "Counter does nothing with a cost 5 Character on the field (#458)",
    me: { field: [KAROO], don: { active: 1 } },
    opp: { hand: ["EB05-008"], field: [BIG], don: { active: 1 } },
    steps: [{ attack: mine("ST01-001"), at: "leader" }, { passBlock: true }, { counter: "EB05-008" }],
    expect: { opp: { power: { "ST01-001": 5000 } }, pending: "none" },
  },

  // EB05-005 Belo Betty: [On Play] Up to 3 of your Characters with both the {Revolutionary Army} type and a [Trigger] gain +2000 power.
  {
    card: "EB05-005", name: "powers a {Revolutionary Army} Character that has a [Trigger] (#458)",
    me: { hand: ["EB05-005"], field: [RA_TRIGGER], don: { active: 2 } },
    steps: [{ play: "EB05-005" }, { pick: [RA_TRIGGER] }],
    expect: { me: { power: { [RA_TRIGGER]: 7000 } } },
  },
  {
    card: "EB05-005", name: "offers neither a Character without [Trigger] nor one of another type (#458)",
    me: { hand: ["EB05-005"], field: [RA_PLAIN, TRIGGER_OTHER], don: { active: 2 } },
    steps: [{ play: "EB05-005" }],
    expect: { me: { power: { [RA_PLAIN]: 5000, [TRIGGER_OTHER]: 3000 } }, pending: "none" },
  },

  // EB05-057 Nojiko: [Activate: Main] [Once Per Turn] Give up to 1 rested DON!! card to 1 of your Leader or Character cards
  // with the "Special" or "Wisdom" Attribute.
  {
    card: "EB05-057", name: "gives a rested DON!! to a Wisdom Character (#458)",
    me: { field: ["EB05-057", WISDOM], don: { active: 0, rested: 1 } },
    steps: [{ activate: mine("EB05-057"), ability: "eb05-057#0" }, { pick: [WISDOM] }],
    expect: { me: { attached: { [WISDOM]: 1 } } },
  },
];

runScenarios("eb05", rows);

// EB05-057 Nojiko: only a Leader or Character with the "Special" or "Wisdom" attribute can receive the DON!!.
describe("EB05-057 Nojiko recipients (#458)", () => {
  it("does not offer a Character with another attribute (#458)", () => {
    const h = new Harness();
    h.field(0, "EB05-057", STRIKE);
    h.don(0, 0, 1);
    h.act(0, { type: "activate_ability", sourceId: h.find(0, "EB05-057")!.id, abilityId: "eb05-057#0" });
    const request = h.choice!.request;
    if (request?.type !== "select") throw new Error("expected a select prompt");
    expect(request.options.map((o) => o.defId)).toEqual(["EB05-057"]);
  });
});

// EB05-010 Nico Robin (Leader): [Once Per Turn] When one of your Characters with the "Wisdom" attribute and without [Blocker]
// is K.O.'d, add up to 1 card from the top of your deck to the top of your Life cards.
function koOnTheirTurn(victim: string) {
  const h = new Harness({ leaders: ["EB05-010", "ST01-001"] });
  const [mineChar] = h.field(0, victim);
  mineChar!.rested = true;
  h.life(0, KAROO, KAROO);
  h.field(1, BIG);
  h.act(0, { type: "end_turn" });
  h.attack(h.find(1, BIG)!, mineChar!);
  h.act(0, { type: "pass_block" });
  h.act(0, { type: "pass_counter" });
  return h;
}

describe("EB05-010 Nico Robin Leader trigger (#458)", () => {
  it("adds a card to Life when a Wisdom Character without Blocker is K.O.'d (#458)", () => {
    const h = koOnTheirTurn(WISDOM);
    expect(h.state.players[0].characters.length).toBe(0);
    expect(h.state.players[0].life.length).toBe(3);
  });

  it("does not trigger for a Wisdom Character with Blocker (#458)", () => {
    const h = koOnTheirTurn(WISDOM_BLOCKER);
    expect(h.state.players[0].characters.length).toBe(0);
    expect(h.state.players[0].life.length).toBe(2);
  });
});

// EB05-043 Perona: [On K.O.] K.O. or rest up to 1 of your opponent's Characters with a cost of 6 or less.
describe("EB05-043 Perona K.O. or rest (#458)", () => {
  function koPerona() {
    const h = new Harness();
    const [perona] = h.field(0, "EB05-043");
    perona!.rested = true;
    h.field(1, KAROO, BIG);
    h.act(0, { type: "end_turn" });
    h.attack(h.find(1, BIG)!, perona!);
    h.act(0, { type: "pass_block" });
    h.act(0, { type: "pass_counter" });
    return h;
  }

  it("lets the owner choose to K.O. the target (#458)", () => {
    const h = koPerona();
    h.pick(KAROO);
    h.pick("K.O. it");
    expect(h.state.players[1].characters.map((c) => c.defId)).toEqual([BIG]);
    expect(h.state.players[1].trash).toEqual([KAROO]);
  });

  it("or to rest it instead (#458)", () => {
    const h = koPerona();
    h.pick(KAROO);
    h.pick("Rest it");
    expect(h.state.players[1].characters.map((c) => [c.defId, c.rested])).toEqual([[KAROO, true], [BIG, true]]);
    expect(h.state.players[1].trash).toEqual([]);
  });
});

// EB05-052 Gloriosa: If you would take damage, you may trash this Character instead.
describe("EB05-052 Gloriosa damage replacement (#458)", () => {
  function hitLeader(opts: { life: string[]; double?: boolean }) {
    const h = new Harness();
    h.field(1, "EB05-052");
    h.life(1, ...opts.life);
    // P-028 has [Double Attack].
    const attacker = opts.double ? h.field(0, "P-028")[0]! : h.state.players[0].leader;
    h.attack(attacker, "leader");
    h.act(1, { type: "pass_block" });
    h.act(1, { type: "pass_counter" });
    return h;
  }

  it("trashing Gloriosa prevents the Life loss from a battle hit (#458)", () => {
    const h = hitLeader({ life: [KAROO, KAROO] });
    expect(h.choice?.kind).toBe("effect");
    h.accept(1);
    expect(h.state.players[1].life.length).toBe(2);
    expect(h.state.players[1].characters.length).toBe(0);
    expect(h.state.players[1].trash).toEqual(["EB05-052"]);
    expect(h.state.phase).toBe("main");
  });

  it("trashing Gloriosa prevents both damage of a Double Attack, which is one hit (#458)", () => {
    const h = hitLeader({ life: [KAROO, KAROO, KAROO], double: true });
    expect(h.choice?.kind).toBe("effect");
    h.accept(1);
    expect(h.choice).toBeUndefined();
    expect(h.state.players[1].life.length).toBe(3);
    expect(h.state.players[1].trash).toEqual(["EB05-052"]);
  });

  it("declining a Double Attack takes both damage without asking again (#458)", () => {
    const h = hitLeader({ life: [KAROO, KAROO, KAROO], double: true });
    h.decline(1);
    h.decline(1); // Life check of the first card
    expect(h.choice?.kind).toBe("life_trigger");
    h.decline(1); // Life check of the second card
    expect(h.state.players[1].life.length).toBe(1);
    expect(h.state.players[1].characters.map((c) => c.defId)).toEqual(["EB05-052"]);
  });

  it("declining takes the damage and keeps Gloriosa (#458)", () => {
    const h = hitLeader({ life: [KAROO, KAROO] });
    h.decline(1);
    h.decline(1); // the Life check of the card taken as damage
    expect(h.state.players[1].characters.map((c) => c.defId)).toEqual(["EB05-052"]);
    expect(h.state.players[1].life.length).toBe(1);
  });

  it("can prevent a hit that would take the last Life from a Leader at 0 Life (#458)", () => {
    const h = hitLeader({ life: [] });
    h.accept(1);
    expect(h.state.winner).toBeNull();
    expect(h.state.players[1].trash).toEqual(["EB05-052"]);
  });

  it("a Leader at 0 Life that declines still loses (#458)", () => {
    const h = hitLeader({ life: [] });
    h.decline(1);
    expect(h.state.winner).toBe(0);
  });

  // OP06-116 Reject deals 1 damage to an opponent with 1 Life.
  function rejectDamage() {
    const h = new Harness();
    h.don(0, 4);
    h.hand(0, "OP06-116");
    h.field(1, "EB05-052");
    h.life(1, KAROO);
    h.play(0, "OP06-116");
    h.pick("If your opponent has 1 Life card, deal 1 damage to your opponent. Then, add 1 card from the top of your Life cards to your hand.");
    return h;
  }

  it("is asked for effect damage too, and trashing her saves the Life card (#458)", () => {
    const h = rejectDamage();
    expect(h.choice).toMatchObject({ seat: 1, cardDefId: "EB05-052" });
    h.accept(1);
    expect(h.state.players[1].life).toEqual([KAROO]);
    expect(h.state.players[1].trash).toEqual(["EB05-052"]);
    expect(h.choice).toBeUndefined(); // no Life check: nothing was taken
    expect(h.state.players[1].hand.length).toBe(0);
  });

  it("effect damage that is not replaced takes the Life card (#458)", () => {
    const h = rejectDamage();
    h.decline(1);
    h.decline(1); // the Life check of the card taken as damage
    expect(h.state.players[1].life).toEqual([]);
    expect(h.state.players[1].characters.map((c) => c.defId)).toEqual(["EB05-052"]);
  });
});


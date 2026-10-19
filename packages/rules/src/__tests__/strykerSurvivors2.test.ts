import { describe, expect, it } from "vitest";
import { abilitiesFor } from "../cards/abilities.js";
import { basePowerOf, powerOf } from "../engine/queries.js";
import { Harness } from "../testing/harness.js";
import type { Seat } from "../types.js";

// Behavior pinned from the 2026-10-19 weekly Stryker run (#649).

const NAMI = "OP17-023"; // 1-cost {East Blue}/{Straw Hat Crew}: if one of your such Characters would be K.O.'d, you may rest this Character instead.
const ARAMAKI = "OP17-059"; // [On Play] DON!! -1: Draw 1 card and K.O. up to 2 of your opponent's Characters with a cost of 2 or less.
const LUCCI = "OP05-093"; // [On Play] place 3 cards from your trash at the bottom of your deck: K.O. up to 1 cost 2 or less and up to 1 cost 1 or less.
const ALVIDA = "OP03-023"; // vanilla 1-cost {East Blue}
const MERRY = "OP03-052"; // vanilla 1-cost {East Blue}
const KAROO = "ST01-003"; // vanilla 1-cost {Animal}/{Alabasta}
const SAI = "OP01-012"; // vanilla 2-cost 4000

function ids(h: Harness, seat: Seat): string[] {
  return h.state.players[seat].characters.map((c) => c.defId);
}

/** Seat 1 plays Aramaki and K.O.s `targets` of seat 0's field; stops at the first replacement prompt. */
function aramakiAt(field: string[], targets: string[]): Harness {
  const h = new Harness();
  h.field(0, ...field);
  h.hand(1, ARAMAKI);
  h.don(1, 7);
  h.act(0, { type: "end_turn" });
  h.play(1, ARAMAKI).accept().pick("DON").pick(...targets);
  return h;
}

describe("batch-covering replacement", () => {
  it("declining the first replacement does not save the later targets, which are asked again (#649)", () => {
    const h = aramakiAt([NAMI, ALVIDA, MERRY], [ALVIDA, MERRY]);
    expect(h.choice?.request?.type).toBe("confirm");
    h.decline();
    // Alvida is gone and Merry is not covered: Nami is asked again.
    expect(ids(h, 0)).toEqual([NAMI, MERRY]);
    expect(h.choice?.request?.type).toBe("confirm");
    h.decline();
    expect(ids(h, 0)).toEqual([NAMI]);
    expect(h.state.players[0].characters[0]!.rested).toBe(false);
  });

  it("one acceptance saves only the later targets its selector matches (#649)", () => {
    const h = aramakiAt([NAMI, ALVIDA, KAROO], [ALVIDA, KAROO]);
    h.accept();
    // Karoo is neither {East Blue} nor {Straw Hat Crew}: Nami cannot save it.
    expect(ids(h, 0)).toEqual([NAMI, ALVIDA]);
    expect(h.choice).toBeUndefined();
  });
});

describe("replacement bookkeeping between acts of one ability", () => {
  /** Seat 1 plays Lucci: it K.O.s up to 1 Character with cost 2 or less, then up to 1 with cost 1 or less, as two separate acts. */
  function lucci(field: string[]): Harness {
    const h = new Harness();
    h.field(0, ...field);
    h.hand(1, LUCCI);
    h.don(1, 4);
    h.trash(1, KAROO, KAROO, KAROO);
    h.act(0, { type: "end_turn" });
    h.play(1, LUCCI).accept();
    return h;
  }

  it("the second K.O. of one ability picks its own target rather than reusing the first act's (#649)", () => {
    const h = lucci([ALVIDA, MERRY]);
    h.pick(ALVIDA);
    h.pick(MERRY);
    expect(ids(h, 0)).toEqual([]);
  });

  it("a K.O. saved by Nami does not protect the same Character from the ability's second K.O. (#649)", () => {
    const h = lucci([NAMI, ALVIDA]);
    h.pick(ALVIDA);
    h.accept();
    expect(ids(h, 0)).toEqual([NAMI, ALVIDA]);
    expect(h.state.players[0].characters[0]!.rested).toBe(true);
    // Nami is rested now and cannot be paid again: the second K.O. goes through.
    h.pick(ALVIDA);
    expect(ids(h, 0)).toEqual([NAMI]);
  });
});

describe("queued triggers", () => {
  const ACE = "P-028"; // [Double Attack]
  const BONNEY = "OP08-105"; // [DON!! x1] [Your Turn] [Once Per Turn] When a card is removed from your opponent's Life cards, draw 2 cards and trash 1 card from your hand.
  const CARROT = "OP01-009"; // [Trigger] Play this card.
  const LABOON = "EB01-047"; // [Once Per Turn] When a Character is K.O.'d, draw 1 card and trash 1 card from your hand.
  const VISTA = "OP16-011"; // [DON!! x1] [When Attacking] K.O. up to 2 of your opponent's Characters with 2000 base power or less.
  const BLUENO = "EB01-017"; // 2000 power
  const YAMATO = "EB05-046"; // [On Your Opponent's Attack] You may trash 1 card from your hand: If you have 10 or more cards in your trash, your Leader's base power becomes 7000 during this turn.
  const BON_KUREI = "OP04-069"; // [On Your Opponent's Attack] DON!! -1: This Character's base power becomes the same as the attacker's.

  it("a [Once Per Turn] trigger queued twice in one turn resolves once (#649)", () => {
    const h = new Harness();
    const [ace] = h.field(0, ACE);
    const [bonney] = h.field(0, BONNEY);
    h.attach(0, bonney!, 1);
    // The first Life card's [Trigger] resolves between the 2 damage points, so Bonney is queued once per point.
    h.life(1, CARROT, KAROO, KAROO);
    const deckBefore = h.state.players[0].deck.length;
    h.attack(ace!, "leader");
    h.act(1, { type: "pass_block" });
    h.act(1, { type: "pass_counter" });
    h.accept(1);
    h.decline(1);
    expect(h.choice?.cardDefId).toBe(BONNEY);
    h.pick(KAROO);
    expect(h.choice).toBeUndefined();
    expect(h.state.players[0].deck.length).toBe(deckBefore - 2);
  });

  it("two copies of a [Once Per Turn] trigger each fire for one K.O. (#649)", () => {
    const h = new Harness();
    const [vista] = h.field(0, VISTA);
    h.attach(0, vista!, 1);
    h.field(1, LABOON, LABOON, BLUENO);
    h.hand(1, KAROO, KAROO);
    const deckBefore = h.state.players[1].deck.length;
    h.attack(vista!, "leader");
    h.pick(BLUENO);
    // Each Laboon is its own [Once Per Turn]: both are queued, so the player orders them.
    expect(h.choice?.kind).toBe("order_effects");
    expect(h.choice!.unorderedChoices).toHaveLength(2);
    h.act(1, { type: "order_pending_effects", orderedIds: h.choice!.unorderedChoices!.map((c) => c.id) });
    while (h.choice) h.pick(KAROO);
    expect(h.state.players[1].deck.length).toBe(deckBefore - 2);
  });

  it("a trigger whose resolve-time gate closed does nothing and the next trigger still starts (#649)", () => {
    const h = new Harness();
    const [bon] = h.field(1, BON_KUREI, YAMATO);
    h.hand(1, KAROO, KAROO);
    h.trash(1, ...Array.from({ length: 9 }, () => KAROO));
    h.don(1, 2);
    const [sai] = h.field(0, SAI);
    h.attack(sai!, "leader");
    // Bon Kurei (4000 base) and Sai (4000) are queued, and the base power already equals the attacker's when it resolves.
    const unordered = h.choice!.unorderedChoices!;
    expect(unordered).toHaveLength(2);
    h.act(1, { type: "order_pending_effects", orderedIds: [...unordered].sort((a, b) => (a.cardDefId === BON_KUREI ? -1 : 1) - (b.cardDefId === BON_KUREI ? -1 : 1)).map((c) => c.id) });
    // Bon Kurei is skipped without a prompt; Yamato is asked next.
    expect(h.choice?.cardDefId).toBe(YAMATO);
    expect(h.state.players[1].costArea).toHaveLength(2);
    expect(basePowerOf(h.state, 1, bon!)).toBe(4000);
  });
});

describe("Events, selections and costs", () => {
  const SABO = "OP15-046"; // [On Play] If your Leader has the {Dressrosa} type, activate up to 1 {Dressrosa} type Event from your hand.
  const KYROS = "EB01-040"; // {Dressrosa} Leader
  const BARRIER_BULLS = "OP15-019"; // {Dressrosa} Event, [Main] Draw 1 card and your Leader gains +1000 power until the end of your opponent's next End Phase.
  const LUFFY = "OP15-119"; // 7000, when your opponent activates an Event or [Blocker], reveal a Life card: +1000 power per cost.
  const ROBIN = "ST01-008"; // 3-cost
  const LOKI = "OP17-119"; // [On Play] K.O. your opponent's Characters with a total cost of 4 or less.
  const SAI = "OP01-012"; // vanilla 2-cost
  const WIRE = "OP01-053"; // vanilla 2-cost
  const TASHIGI = "OP14-029"; // [Activate: Main] [Once Per Turn] You may rest 2 of your cards: +2000 power until the end of your opponent's next End Phase.

  it("activating an Event from the hand with Sabo counts as an Event activation for the opponent's Luffy (#649)", () => {
    const h = new Harness({ leaders: [KYROS, "ST01-001"] });
    h.hand(0, SABO, BARRIER_BULLS);
    h.don(0, 7);
    const [luffy] = h.field(1, LUFFY);
    h.life(1, ROBIN);
    h.play(0, SABO);
    h.pick(BARRIER_BULLS);
    expect(h.state.players[0].trash).toContain(BARRIER_BULLS);
    // Luffy revealed the 3-cost Life card: +3000.
    expect(powerOf(h.state, 1, luffy!)).toBe(7000 + 3000);
  });

  it("a K.O. selection with a total cost limit of 4 accepts exactly 4 and rejects 5 (#649)", () => {
    const h = new Harness();
    h.hand(0, LOKI);
    h.don(0, 10);
    h.field(1, SAI, WIRE, ALVIDA);
    h.play(0, LOKI);
    const options = (h.choice!.request as { options: { id: string; defId?: string }[] }).options;
    const idOf = (defId: string) => options.find((o) => o.defId === defId)!.id;
    const pick = (...selectedOptionIds: string[]) => h.try(0, { type: "resolve_pending_choice", accept: true, selectedOptionIds });
    expect(pick(idOf(SAI), idOf(WIRE), idOf(ALVIDA)).ok).toBe(false);
    expect(pick(idOf(SAI), idOf(WIRE)).ok).toBe(true);
  });

  it("\"rest 2 of your cards\" as a cost counts an active DON!! and never a rested one (#649)", () => {
    const abilityId = abilitiesFor(TASHIGI).find((a) => a.trigger === "activate_main")!.id;
    const activate = (active: number, rested: number) => {
      const h = new Harness();
      const [tashigi] = h.field(0, TASHIGI);
      // The Leader is rested, so Tashigi herself is the only active card on the field.
      h.state.players[0].leader.rested = true;
      h.don(0, active, rested);
      return h.try(0, { type: "activate_ability", sourceId: tashigi!.id, abilityId }).ok;
    };
    // Tashigi plus one active DON!! pay the 2 cards; Tashigi plus one rested DON!! cannot.
    expect(activate(1, 0)).toBe(true);
    expect(activate(0, 1)).toBe(false);
  });
});

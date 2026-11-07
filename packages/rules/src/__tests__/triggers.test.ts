import { describe, expect, it } from "vitest";
import { basePowerOf } from "../engine/queries.js";
import { Harness } from "../testing/harness.js";
import type { Seat } from "../types.js";

// Trigger timing: delayed effects, end-of-battle triggers and the trigger queue.

const THATCH = "OP03-005"; // 1-cost, [Activate: Main] +2000 power during this turn. Then, trash this Character at the end of this turn.
const PRB_LUFFY = "PRB02-005"; // 4-cost, [Your Turn] [On Play] If your Leader is multicolored and the opponent has 7 or less DON!!: they rest 1 active DON!! at the start of their next Main Phase.
const MULTICOLOR_LEADER = "EB01-001"; // red/green
const BENTHAM = "OP02-064"; // 5-cost, [DON!! x1] [When Attacking] ... Then, at the end of this battle, place this Character at the bottom of the owner's deck.
const HAWKINS = "ST02-010"; // 6000, [DON!! x1] [Once Per Turn] [Your Turn] If this Character battles your opponent's Character, set this card as active.
const BENTHAM_KO = "ST08-013"; // 6000, [DON!! x1] At the end of a battle in which this Character battles your opponent's Character, you may KO that Character.
const ROBIN = "ST01-008"; // vanilla 5000
const SAI = "OP01-012"; // vanilla 2-cost 4000
const KAROO = "ST01-003"; // vanilla 1-cost {Animal}/{Alabasta}
const ALVIDA = "OP03-023"; // vanilla 1-cost {East Blue}

/** End the active seat's turn; the other seat's turn begins. */
function endTurn(h: Harness): void {
  h.act(h.state.activeSeat, { type: "end_turn" });
}

function ids(h: Harness, seat: Seat): string[] {
  return h.state.players[seat].characters.map((c) => c.defId);
}

describe("delayed effects and end-of-battle triggers", () => {
  it("\"at the end of this turn\" fires at the end of its own turn, once, and leaves nothing queued (#561)", () => {
    const h = new Harness();
    const [thatch] = h.field(0, THATCH);
    h.act(0, { type: "activate_ability", sourceId: thatch!.id, abilityId: "op03-005#0" });
    // Still on the field for the rest of the turn.
    expect(h.state.players[0].characters.map((c) => c.defId)).toEqual([THATCH]);
    expect(h.state.delayed).toHaveLength(1);
    endTurn(h);
    expect(h.state.players[0].characters).toEqual([]);
    expect(h.state.players[0].trash).toContain(THATCH);
    expect(h.state.delayed).toEqual([]);
  });

  it("\"at the start of your opponent's next Main Phase\" waits through the end of the turn and rests their DON!! only then (#561)", () => {
    const h = new Harness({ leaders: [MULTICOLOR_LEADER, "ST01-001"] });
    h.hand(0, PRB_LUFFY);
    h.don(0, 4);
    h.don(1, 5);
    h.play(0, PRB_LUFFY);
    expect(h.state.delayed).toHaveLength(1);
    expect(h.state.players[1].costArea.filter((d) => d.rested)).toHaveLength(0);
    endTurn(h);
    // Seat 1 refreshed, took 2 DON!! (5 + 2 = 7), and then lost one active DON!! to the delayed effect.
    expect(h.state.activeSeat).toBe(1);
    const opp = h.state.players[1];
    expect(opp.costArea).toHaveLength(7);
    expect(opp.costArea.filter((d) => d.rested)).toHaveLength(1);
    expect(h.state.delayed).toEqual([]);
  });

  it("\"at the end of this battle\" fires when the battle ends, not before and not at the end of the turn (#561)", () => {
    const h = new Harness();
    const [bentham] = h.field(0, BENTHAM);
    h.attach(0, bentham!, 1);
    h.hand(0, ROBIN);
    h.attack(bentham!, "leader");
    h.accept().pick(ROBIN);
    expect(h.state.phase).toBe("block");
    expect(h.state.delayed).toHaveLength(1);
    expect(h.state.players[0].characters.map((c) => c.defId)).toEqual([BENTHAM]);
    h.passBattle();
    expect(h.state.phase).toBe("main");
    expect(h.state.players[0].characters).toEqual([]);
    expect(h.state.players[0].deck.at(-1)).toBe(BENTHAM);
    expect(h.state.delayed).toEqual([]);
  });

  it("an attacker's \"battles your opponent's Character\" trigger fires for a Character target and not for a Leader target (#561)", () => {
    for (const target of ["character", "leader"] as const) {
      const h = new Harness();
      const [hawkins] = h.field(0, HAWKINS);
      const [karoo] = h.field(1, KAROO);
      karoo!.rested = true;
      h.attach(0, hawkins!, 1);
      h.attack(hawkins!, target === "leader" ? "leader" : karoo!);
      h.passBattle();
      expect(h.state.phase).toBe("main");
      // Set active only after a battle with a Character.
      expect(h.find(0, HAWKINS)!.rested).toBe(target === "leader");
    }
  });

  it("a defender's \"battles your opponent's Character\" trigger fires for a Character attacker and not for a Leader attacker (#561)", () => {
    for (const attackerKind of ["character", "leader"] as const) {
      const h = new Harness();
      const [defender] = h.field(0, BENTHAM_KO);
      defender!.rested = true;
      h.attach(0, defender!, 1);
      const [attacker] = h.field(1, KAROO);
      endTurn(h);
      h.attack(attackerKind === "leader" ? h.state.players[1].leader : attacker!, defender!);
      h.act(0, { type: "pass_block" });
      h.act(0, { type: "pass_counter" });
      // The defender is 6000 and survives either attacker; only the Character attacker's battle prompts its "may KO".
      expect(h.choice?.cardDefId).toBe(attackerKind === "character" ? BENTHAM_KO : undefined);
    }
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

describe("a delayed effect that does not name the source card", () => {
  const BONNEY = "EB02-015"; // 7-cost. [On Play] ... set up to 1 of your DON!! cards as active at the end of this turn.

  it("still fires at the end of the turn after its source left the field (#753)", () => {
    const h = new Harness();
    h.field(0, KAROO, KAROO, KAROO, KAROO);
    h.hand(0, BONNEY, ALVIDA);
    h.don(0, 10);
    h.play(0, BONNEY);
    h.forced();
    // A 6th Character: Bonney is the one trashed to make room.
    h.play(0, ALVIDA, { trashCharacterId: h.find(0, BONNEY)!.id });
    expect(ids(h, 0)).not.toContain(BONNEY);
    const rested = () => h.state.players[0].costArea.filter((d) => d.rested).length;
    const before = rested();
    expect(before).toBe(8);
    h.act(0, { type: "end_turn" });
    expect(rested()).toBe(before - 1);
  });
});

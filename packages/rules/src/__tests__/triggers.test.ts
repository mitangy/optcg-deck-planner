import { describe, expect, it } from "vitest";
import { basePowerOf } from "../engine/queries.js";
import { Harness } from "../testing/harness.js";
import type { Seat } from "../types.js";

const THATCH = "OP03-005";
const PRB_LUFFY = "PRB02-005";
const MULTICOLOR_LEADER = "EB01-001";
const BENTHAM = "OP02-064";
const HAWKINS = "ST02-010";
const BENTHAM_KO = "ST08-013";
const ROBIN = "ST01-008";
const SAI = "OP01-012";
const KAROO = "ST01-003";
const ALVIDA = "OP03-023";

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
  const ACE = "P-028";
  const BONNEY = "OP08-105";
  const CARROT = "OP01-009";
  const LABOON = "EB01-047";
  const VISTA = "OP16-011";
  const BLUENO = "EB01-017";
  const YAMATO = "EB05-046";
  const BON_KUREI = "OP04-069";

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
    expect(h.choice?.cardDefId).toBe(YAMATO);
    expect(h.state.players[1].costArea).toHaveLength(2);
    expect(basePowerOf(h.state, 1, bon!)).toBe(4000);
  });
});

describe("a delayed effect that does not name the source card", () => {
  const BONNEY = "EB02-015";

  it("still fires at the end of the turn after its source left the field (#753)", () => {
    const h = new Harness();
    h.field(0, KAROO, KAROO, KAROO, KAROO);
    h.hand(0, BONNEY, ALVIDA);
    h.don(0, 10);
    h.play(0, BONNEY);
    h.forced();
    h.play(0, ALVIDA, { trashCharacterId: h.find(0, BONNEY)!.id });
    expect(ids(h, 0)).not.toContain(BONNEY);
    const rested = () => h.state.players[0].costArea.filter((d) => d.rested).length;
    const before = rested();
    expect(before).toBe(8);
    h.act(0, { type: "end_turn" });
    expect(rested()).toBe(before - 1);
  });
});

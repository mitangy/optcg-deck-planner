import { describe, expect, it } from "vitest";
import { abilitiesFor } from "../cards/abilities.js";
import { addModifier } from "../engine/modifiers.js";
import { powerOf } from "../engine/queries.js";
import { Harness } from "../testing/harness.js";
import type { Seat } from "../types.js";

// Paying costs: DON!! returns, exact-cost checks and cost selections.

const KAROO = "ST01-003"; // vanilla 3000
const BLACK_MARIA = "OP08-074"; // [Activate: Main] [Once Per Turn] Add up to 5 DON!! rested. Then, at the end of this turn, return DON!! from your field until you have the same number as your opponent.
const SHIRAHOSHI = "OP05-082"; // 1-cost, [Activate: Main] You may rest this Character and place 2 cards from your trash at the bottom of your deck: ...
const MORIA_LEADER = "OP14-080"; // [Activate: Main] [Once Per Turn] You may KO 1 of your {Thriller Bark Pirates} type Characters: ...
const PERONA = "ST12-005"; // {Thriller Bark Pirates} Character, no text
const LOLA = "OP06-094"; // {Thriller Bark Pirates} Character, no text
const ALVIDA = "OP15-003"; // [Activate: Main] [Once Per Turn] You may give 1 of your opponent's rested DON!! to 1 of your opponent's Characters: ...
const ALVIDA_EAST_BLUE = "OP03-023"; // vanilla 1-cost {East Blue}
const SAI = "OP01-012"; // vanilla 2-cost 4000

/** End the active seat's turn; the other seat's turn begins. */
function endTurn(h: Harness): void {
  h.act(h.state.activeSeat, { type: "end_turn" });
}

describe("returning DON!! to the DON!! deck", () => {
  function endOfTurnReturn(setup: (h: Harness) => void, opponentDon: number): Harness {
    const h = new Harness();
    const [maria] = h.field(0, BLACK_MARIA);
    setup(h);
    h.don(1, opponentDon);
    h.act(0, { type: "activate_ability", sourceId: maria!.id, abilityId: "op08-074#m0" });
    expect(h.choice).toBeUndefined();
    endTurn(h);
    return h;
  }

  it("returns rested DON!! before active DON!! (#561)", () => {
    // 2 active + 8 rested after Black Maria adds 5; the opponent has 8, so 2 go back and the active pair stays.
    const h = endOfTurnReturn((hh) => hh.don(0, 2, 3), 8);
    const p = h.state.players[0];
    expect(p.costArea.filter((d) => !d.rested)).toHaveLength(2);
    expect(p.costArea.filter((d) => d.rested)).toHaveLength(6);
    expect(p.donDeck).toHaveLength(2);
    // DON!! in the DON!! deck are active.
    expect(p.donDeck.some((d) => d.rested)).toBe(false);
  });

  it("returns active DON!! once no rested DON!! is left (#561)", () => {
    // 5 active + 5 rested after Black Maria adds 5; the opponent has 3, so all 5 rested go and 2 of the 5 active.
    const h = endOfTurnReturn((hh) => hh.don(0, 5), 3);
    const p = h.state.players[0];
    expect(p.costArea.filter((d) => d.rested)).toHaveLength(0);
    expect(p.costArea.filter((d) => !d.rested)).toHaveLength(3);
    expect(p.donDeck).toHaveLength(7);
  });

  it("falls back to attached DON!! when the cost area runs out (#561)", () => {
    // The Leader has 6 attached and the cost area 4 (the DON!! deck is empty, so Black Maria adds none). The opponent has 4:
    // all 4 in the cost area go back, then 2 of the attached.
    const h = endOfTurnReturn((hh) => {
      hh.don(0, 8);
      hh.attach(0, hh.state.players[0].leader, 6);
    }, 4);
    const p = h.state.players[0];
    expect(p.costArea).toHaveLength(0);
    expect(p.attachedDons).toHaveLength(4);
    expect(p.leader.attachedDonIds).toHaveLength(4);
    expect(p.donDeck).toHaveLength(6);
  });
});

describe("paying a cost needs exactly enough", () => {
  function canActivate(h: Harness, seat: Seat, sourceId: string, abilityId: string): boolean {
    return h.legal(seat).some((i) => i.type === "activate_ability" && i.sourceId === sourceId && i.abilityId === abilityId);
  }

  it("placing N cards from the trash at the bottom of the deck needs N in the trash (#561)", () => {
    for (const trashed of [1, 2, 3]) {
      const h = new Harness();
      const [shirahoshi] = h.field(0, SHIRAHOSHI);
      h.trash(0, ...Array.from({ length: trashed }, () => KAROO));
      expect(canActivate(h, 0, shirahoshi!.id, "op05-082#0")).toBe(trashed >= 2);
    }
  });

  it("a K.O. cost cannot pick a Character that cannot be K.O.'d, by itself or by effects (#561)", () => {
    for (const [protection, payable] of [[null, true], ["cannot_be_ko", false], ["cannot_be_ko_by_effect", false]] as const) {
      const h = new Harness({ leaders: [MORIA_LEADER, "ST01-001"] });
      const [perona] = h.field(0, PERONA);
      if (protection) addModifier(h.state, 0, undefined, { kind: "card", id: perona!.id }, { type: "restrict", restriction: protection }, { kind: "end_of_turn", turn: h.state.turnNumber });
      expect(canActivate(h, 0, h.state.players[0].leader.id, "op14-080#0")).toBe(payable);
    }
  });

  it("a K.O. cost is payable when another Character can be K.O.'d (#561)", () => {
    const h = new Harness({ leaders: [MORIA_LEADER, "ST01-001"] });
    const [perona] = h.field(0, PERONA, LOLA);
    addModifier(h.state, 0, undefined, { kind: "card", id: perona!.id }, { type: "restrict", restriction: "cannot_be_ko" }, { kind: "end_of_turn", turn: h.state.turnNumber });
    expect(canActivate(h, 0, h.state.players[0].leader.id, "op14-080#0")).toBe(true);
  });

  it("giving the opponent's rested DON!! needs a rested DON!! and one of their Characters (#561)", () => {
    for (const [rested, characters, payable] of [[1, 1, true], [0, 1, false], [1, 0, false]] as const) {
      const h = new Harness();
      const [alvida] = h.field(0, ALVIDA);
      h.don(1, 3, rested);
      if (characters) h.field(1, KAROO);
      expect(canActivate(h, 0, alvida!.id, "op15-003#m0")).toBe(payable);
    }
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
    h.field(1, SAI, WIRE, ALVIDA_EAST_BLUE);
    h.play(0, LOKI);
    const options = (h.choice!.request as { options: { id: string; defId?: string }[] }).options;
    const idOf = (defId: string) => options.find((o) => o.defId === defId)!.id;
    const pick = (...selectedOptionIds: string[]) => h.try(0, { type: "resolve_pending_choice", accept: true, selectedOptionIds });
    expect(pick(idOf(SAI), idOf(WIRE), idOf(ALVIDA_EAST_BLUE)).ok).toBe(false);
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

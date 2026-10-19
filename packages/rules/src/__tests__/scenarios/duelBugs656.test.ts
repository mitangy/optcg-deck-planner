/**
 * Duel-engine card bugs from the Shirahoshi / Buggy / Crocodile audit (#656).
 */
import { describe, expect, it } from "vitest";
import { Harness } from "../../testing/harness.js";
import { runScenarios, mine, type CardScenario } from "../../testing/scenario.js";
import type { Seat } from "../../types.js";

const F = "ST01-003";
const donTotal = (h: Harness, seat: Seat) => h.state.players[seat].costArea.length;
/** Answer whatever is pending (first option / accept) until nothing is left, stopping at Life triggers. */
function drain(h: Harness, max = 20): void {
  for (let i = 0; i < max && h.choice && h.choice.kind !== "life_trigger"; i += 1) {
    const c = h.choice;
    const r = c.request as { type?: string; options?: { id: string }[]; min?: number; max?: number } | undefined;
    if (c.kind === "order_effects") { h.act(c.seat, { type: "order_pending_effects", orderedIds: c.unorderedChoices!.map((u) => u.id) }); continue; }
    if (!r || r.type === "confirm" || !r.options) { h.accept(); continue; }
    const n = Math.max(r.min ?? 0, Math.min(1, r.max ?? 1));
    h.act(c.seat, { type: "resolve_pending_choice", accept: true, selectedOptionIds: r.options.slice(0, n).map((o) => o.id) });
  }
}

// ---- 1. "{Trait} type Character card or [Name]": the trait applies to the Character branch only ----
const SHIRAHOSHI_LEADER = "OP11-022";
const MEGALO = "EB04-018"; // not Neptunian
const SPOTTED = "OP11-036"; // Neptunian
const CAMIE = "EB05-012"; // Merfolk, not Neptunian
const SHIRA_CHAR = "OP11-030"; // [Shirahoshi], not Neptunian

const shirahoshiRows: CardScenario[] = [
  {
    card: SHIRAHOSHI_LEADER, name: "the Leader can play [Megalo] even though it is not {Neptunian} (#656)",
    leaders: { me: SHIRAHOSHI_LEADER }, me: { hand: [MEGALO], don: { active: 4 }, life: [F, F, F] },
    steps: [{ activate: mine(SHIRAHOSHI_LEADER), ability: "op11-022#1" }, { pick: [MEGALO] }],
    expect: { me: { field: [MEGALO], hand: [] } },
  },
  {
    card: SHIRAHOSHI_LEADER, name: "the Leader still cannot play a Character that is neither {Neptunian} nor [Megalo] (#656)",
    leaders: { me: SHIRAHOSHI_LEADER }, me: { hand: [CAMIE], don: { active: 4 }, life: [F, F, F] },
    steps: [{ activate: mine(SHIRAHOSHI_LEADER), ability: "op11-022#1" }],
    expect: { me: { field: [], hand: [CAMIE] } },
  },
  {
    card: SPOTTED, name: "On Play can reveal [Shirahoshi] although it is not {Neptunian} (#656)",
    leaders: { me: SHIRAHOSHI_LEADER }, me: { hand: [SPOTTED], don: { active: 4 }, deckTop: [SHIRA_CHAR, F, F, F, F] },
    steps: [{ play: SPOTTED }, { pick: [SHIRA_CHAR] }],
    expect: { me: { hand: [SHIRA_CHAR] } },
  },
];
runScenarios("trait applies to the Character branch of 'Character or [Name]' (#656)", shirahoshiRows);

// ---- 2. Crocodile OP04-058: only DON!! returned by YOUR effect draws it back ----
describe("OP04-058 Crocodile counts only DON!! returned by your own effect (#656)", () => {
  const CROC = "OP04-058";
  it("the opponent's OP02-085 Magellan forcing a DON!! return does not add DON!! (#656)", () => {
    const h = new Harness({ leaders: ["ST01-001", CROC] });
    h.don(0, 6, 0); h.hand(0, "OP02-085"); h.don(1, 4, 0);
    h.play(0, "OP02-085"); drain(h);
    expect(donTotal(h, 1)).toBe(3);
  });
  it("your own [Counter] DON!! -1 still adds DON!! after the opponent forced a return (#656)", () => {
    const h = new Harness({ leaders: ["ST01-001", CROC] });
    h.don(1, 3, 0); h.hand(1, "OP04-076"); h.don(0, 5, 0);
    h.attack(h.state.players[0].leader, "leader"); drain(h);
    h.act(1, { type: "pass_block" });
    h.act(1, { type: "counter_event", handIndex: h.state.players[1].hand.findIndex((c) => c.defId === "OP04-076") });
    drain(h);
    expect(donTotal(h, 1)).toBe(3);
  });
});

// ---- 3. "trash this Character and 1 of your X" cannot be paid by the Character alone ----
describe("a cost naming this Character and another card needs the other card (#656)", () => {
  it("Mr.13 & Ms.Friday cannot be activated with no other Baroque Works Character (#656)", () => {
    const h = new Harness({ leaders: ["ST01-001", "ST01-001"] });
    const [mr13] = h.field(0, "OP04-073");
    const r = h.try(0, { type: "activate_ability", sourceId: mr13!.id, abilityId: "op04-073#0" });
    expect(r.ok).toBe(false);
  });
  it("Mr.13 & Ms.Friday trashes both itself and another Baroque Works Character (#656)", () => {
    const h = new Harness({ leaders: ["ST01-001", "ST01-001"] });
    const [mr13] = h.field(0, "OP04-073");
    h.field(0, "OP04-066"); // another {Baroque Works} Character
    const before = donTotal(h, 0);
    h.act(0, { type: "activate_ability", sourceId: mr13!.id, abilityId: "op04-073#0" });
    drain(h);
    expect(h.state.players[0].characters).toHaveLength(0);
    expect(donTotal(h, 0)).toBe(before + 1);
  });
});

// ---- 4. to_life on a field Character obeys removal protection ----
describe("placing a Character into Life by an effect respects removal protection (#656)", () => {
  const CROC14 = "OP14-079"; // your opponent's Characters cannot be removed from the field by your effects
  const GASTINO = "EB01-053";
  it("Gastino cannot put the opponent's Character into Life while OP14-079 protects it (#656)", () => {
    const h = new Harness({ leaders: [CROC14, "ST01-001"] });
    h.field(1, F); h.hand(0, GASTINO); h.don(0, 10);
    const lifeBefore = h.state.players[1].life.length;
    h.play(0, GASTINO); drain(h);
    expect(h.state.players[1].characters.map((c) => c.defId)).toEqual([F]);
    expect(h.state.players[1].life).toHaveLength(lifeBefore);
  });
  it("Gastino puts the opponent's Character into Life when nothing protects it (#656)", () => {
    const h = new Harness({ leaders: ["ST01-001", "ST01-001"] });
    h.field(1, F); h.hand(0, GASTINO); h.don(0, 10);
    const lifeBefore = h.state.players[1].life.length;
    h.play(0, GASTINO); drain(h);
    expect(h.state.players[1].characters).toHaveLength(0);
    expect(h.state.players[1].life).toHaveLength(lifeBefore + 1);
  });
});

// ---- 5. A delayed effect on "this Character" lapses when that card has left the field ----
runScenarios("delayed self effects lapse after a zone change (#656)", [
  {
    card: "OP03-005", name: "Thatch bounced to hand before the end of the turn is not trashed from hand (#656)",
    me: { field: ["OP03-005"], hand: ["OP02-067"], don: { active: 2 } },
    steps: [{ activate: mine("OP03-005"), ability: "op03-005#0" }, { play: "OP02-067" }, { pick: ["OP03-005"] }, { endTurn: true }],
    expect: { me: { hand: ["OP03-005"], trash: ["OP02-067"] } },
  },
  {
    card: "OP03-005", name: "Thatch still on the field is trashed at the end of the turn (#656)",
    me: { field: ["OP03-005"] },
    steps: [{ activate: mine("OP03-005"), ability: "op03-005#0" }, { endTurn: true }],
    expect: { me: { field: [], trash: ["OP03-005"] } },
  },
  {
    card: "OP02-064", name: "Mr.2 bounced to hand by a Counter during its battle stays in hand at the end of the battle (#656)",
    me: { field: [{ card: "OP02-064", don: 1 }], hand: [F] },
    leaders: { opp: "OP01-062" },
    opp: { hand: ["OP01-089"], don: { active: 5 }, field: [{ card: F, rested: true }] },
    steps: [{ attack: mine("OP02-064"), at: "leader" }, { accept: true }, { pick: [F] }, { passBlock: true }, { counter: "OP01-089" }, { pick: ["OP02-064"] }],
    expect: { me: { hand: ["OP02-064"], field: [] }, pending: "none" },
  },
]);

// ---- 6. Arlong OP15-023 ----
describe("Arlong OP15-023 (#656)", () => {
  const ARLONG = "OP15-023";
  it("[On K.O.] can choose the opponent's rested DON!! and they stay rested through the Refresh Phase (#656)", () => {
    const h = new Harness({ leaders: ["ST01-001", "ST01-001"] });
    h.field(0, ARLONG);
    h.act(0, { type: "end_turn" });
    const arlong = h.find(0, ARLONG)!;
    arlong.rested = true;
    h.don(1, 0, 3);
    const [attacker] = h.field(1, "ST01-008");
    h.attack(attacker!, arlong);
    h.passBattle();
    const options = (h.choice!.request as { options: { id: string; defId: string; zone: string }[] }).options;
    const dons = options.filter((o) => o.zone === "don");
    expect(dons).toHaveLength(3);
    h.act(0, { type: "resolve_pending_choice", accept: true, selectedOptionIds: dons.slice(0, 2).map((o) => o.id) });
    drain(h);
    expect(h.state.players[1].costArea.filter((d) => d.noRefresh)).toHaveLength(2);
  });
  const mk = (oppChars: number, oppRested: number) => {
    const h = new Harness({ leaders: ["ST01-001", "ST01-001"] });
    const [arlong] = h.field(0, ARLONG);
    for (let i = 0; i < oppChars; i += 1) h.field(1, F);
    h.don(1, 1, oppRested);
    return { h, arlong: arlong! };
  };
  const activate = (h: Harness, arlong: { id: string }) => h.try(0, { type: "activate_ability", sourceId: arlong.id, abilityId: "op15-023#m0" });
  it("[Activate: Main] gives the opponent's rested DON!! to their Character, then up to 1 more to their Leader or a Character (#656)", () => {
    const { h, arlong } = mk(1, 2);
    h.act(0, { type: "activate_ability", sourceId: arlong.id, abilityId: "op15-023#m0" });
    drain(h);
    const opp = h.state.players[1];
    expect(opp.attachedDons).toHaveLength(2);
    expect(opp.costArea).toHaveLength(1);
  });
  it("[Activate: Main] cannot be used when the opponent has no Character (#656)", () => {
    const { h, arlong } = mk(0, 2);
    expect(activate(h, arlong).ok).toBe(false);
  });
  it("[Activate: Main] cannot be used when the opponent has no rested DON!! in their cost area (#656)", () => {
    const { h, arlong } = mk(1, 0);
    expect(activate(h, arlong).ok).toBe(false);
  });
});

// ---- 7. Hyouzou errata ----
describe("OP06-034 Hyouzou is {Merfolk} after the 2024-12-06 errata (#656)", () => {
  it("Ikaros Much cannot play Hyouzou but can still play another {Fish-Man} (#656)", () => {
    const h = new Harness({ leaders: ["OP06-020", "ST01-001"] }); // Leader with {New Fish-Man Pirates}
    h.don(0, 5); h.hand(0, "OP06-024", "OP06-034", "OP06-030");
    h.play(0, "OP06-024");
    const options = ((h.choice?.request ?? {}) as { options?: { defId?: string }[] }).options ?? [];
    expect(options.map((o) => o.defId)).not.toContain("OP06-034");
    expect(options.map((o) => o.defId)).toContain("OP06-030");
  });
});

// ---- 8. Play prompts do not offer cards a play lock forbids ----
describe("a play lock removes locked cards from play-from-hand choices (#656)", () => {
  it("after OP13-118 Luffy, the Shirahoshi Leader only offers Characters with base cost under 5 (#656)", () => {
    const LONGJAW = "OP11-103"; // {Neptunian}, base cost 5
    const h = new Harness({ leaders: [SHIRAHOSHI_LEADER, "ST01-001"] });
    h.don(0, 10); h.life(0, F, F, F); h.hand(0, "OP13-118", LONGJAW, SPOTTED);
    h.play(0, "OP13-118"); drain(h);
    expect(h.state.players[0].characters.map((c) => c.defId)).toContain("OP13-118");
    h.act(0, { type: "activate_ability", sourceId: h.state.players[0].leader.id, abilityId: "op11-022#1" });
    const options = ((h.choice?.request ?? {}) as { options?: { defId?: string }[] }).options ?? [];
    expect(options.map((o) => o.defId)).toEqual([SPOTTED]);
  });
});

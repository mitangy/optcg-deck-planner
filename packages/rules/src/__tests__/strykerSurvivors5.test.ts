import { describe, expect, it } from "vitest";
import { getPlayerView } from "../engine.js";
import { FILLER, Harness } from "../testing/harness.js";
import type { Intent } from "../types.js";

const DECLINE: Intent = { type: "resolve_pending_choice", accept: false };

// Weekly Stryker survivors 2026-11-09.

/** OP15-057 Stage (seat 1): "On Your Opponent's Attack: You may rest this Stage and trash 1 Event or Stage card from your hand". */
function attackedWithStage(opts: { stageRested: boolean; hand: string[] }) {
  const h = new Harness({ leaders: ["ST01-001", "ST01-001"] });
  const stage = h.stage(1, "OP15-057");
  stage.rested = opts.stageRested;
  h.hand(1, ...opts.hand);
  h.act(0, { type: "declare_attack", attackerId: h.state.players[0].leader.id, target: { kind: "leader" } });
  return h;
}

describe("hidden-info cost prompts with a mixed public/hidden cost list (H1)", () => {
  // The costs are "rest this Stage" (public: whether the Stage is rested is visible) and "trash 1 Event or Stage card from your hand" (hidden: depends on the hand).
  const EVENT_IN_HAND = "OP01-029"; // Radical Beam!!, an Event: pays the hand cost

  it("a public cost that cannot be paid skips the prompt even when the hidden cost could be paid, so the opponent learns nothing (#1197)", () => {
    const withEvent = attackedWithStage({ stageRested: true, hand: [EVENT_IN_HAND] });
    const withoutEvent = attackedWithStage({ stageRested: true, hand: [FILLER] });
    expect(withEvent.choice).toBeUndefined();
    expect(withoutEvent.choice).toBeUndefined();
  });

  it("an unpayable hidden cost is still asked when the public cost can be paid, and only declining is legal (#1197)", () => {
    const h = attackedWithStage({ stageRested: false, hand: [FILLER] });
    expect(h.choice).toBeDefined();
    expect(getPlayerView(h.state, 1).pendingChoices[0]!.unpayable).toBe(true);
    expect(h.legal(1)).toEqual([DECLINE]);
  });
});

describe("extra turn (R4)", () => {
  it("OP05-119 Kaido's extra turn keeps the same player active for the next turn (#1197)", () => {
    // OP05-119: "[On Play] DON!! -10: ... Then, take an extra turn after this one."
    const h = new Harness();
    h.hand(0, "OP05-119");
    h.don(0, 10);
    h.play(0, "OP05-119");
    h.accept();
    h.forced();
    expect(h.state.activeSeat).toBe(0);
    const turn = h.state.turnNumber;
    h.act(0, { type: "end_turn" });
    expect(h.state.turnNumber).toBe(turn + 1);
    expect(h.state.activeSeat).toBe(0);
    // The extra turn is used up: the next turn passes to the opponent.
    h.act(0, { type: "end_turn" });
    expect(h.state.activeSeat).toBe(1);
  });
});

describe("change the attack target (R5)", () => {
  // OP14-060 Doflamingo Leader (seat 1): "[On Your Opponent's Attack] [Once Per Turn] DON!! -1: Select your Leader or 1 of your
  // {Donquixote Pirates} type Characters. Change the attack target to the selected card."
  const MONET = "OP01-082"; // vanilla {Donquixote Pirates} Character
  function redirect(attackLeader: boolean) {
    const h = new Harness({ leaders: ["ST01-001", "OP14-060"] });
    const [monet] = h.field(1, MONET);
    monet!.rested = true;
    h.don(1, 2);
    const attacker = h.state.players[0].leader;
    h.act(0, { type: "declare_attack", attackerId: attacker.id, target: attackLeader ? { kind: "leader" } : { kind: "character", instanceId: monet!.id } });
    return { h, monet: monet! };
  }

  it("redirecting an attack on a Character to the defender's Leader makes the Leader the target (#1197)", () => {
    const { h } = redirect(false);
    h.accept();
    h.pick("Active DON!!");
    h.pick(h.state.players[1].leader.id);
    expect(h.state.battle!.target).toEqual({ kind: "leader" });
  });

  it("redirecting an attack on the Leader to a Character makes that Character the target (#1197)", () => {
    const { h, monet } = redirect(true);
    h.accept();
    h.pick("Active DON!!");
    h.pick(monet.id);
    expect(h.state.battle!.target).toEqual({ kind: "character", instanceId: monet.id });
  });
});

describe("Life effects (R7)", () => {
  const LIFE = ["ST01-004", "ST01-005", "ST01-006"]; // top, middle, bottom: three different cards

  it("OP09-104 Sabo takes the bottom Life card when Bottom is chosen, and the top one when Top is chosen (#1197)", () => {
    // OP09-104: "... if you have 2 or more Life cards, add 1 card from the top or bottom of your Life cards to your hand."
    for (const [label, taken, left] of [["Bottom", "ST01-006", ["ST01-004", "ST01-005"]], ["Top", "ST01-004", ["ST01-005", "ST01-006"]]] as const) {
      const h = new Harness();
      h.hand(0, "OP09-104");
      h.don(0, 7);
      h.life(0, ...LIFE);
      h.play(0, "OP09-104");
      if (h.choice?.request?.type === "select") h.pick();
      expect(h.choice?.request?.type).toBe("mode");
      h.pick(label);
      expect(h.state.players[0].hand.map((c) => c.defId)).toEqual([taken]);
      expect(h.state.players[0].life).toEqual(left);
    }
  });

  it("EB02-053 Myskina Olga asks whose Life to look at and shows the chosen player's top Life card (#1197)", () => {
    // EB02-053: "Look at up to 1 card from the top of your or your opponent's Life cards and place it at the top or bottom of the Life cards."
    for (const [label, expected] of [["Your Life", "ST01-004"], ["Opponent's Life", "ST01-009"]] as const) {
      const h = new Harness();
      h.hand(0, "EB02-053");
      h.don(0, 3);
      h.life(0, ...LIFE);
      h.life(1, "ST01-009", "ST01-010");
      h.play(0, "EB02-053");
      expect(h.choice!.request!.type).toBe("mode");
      h.pick(label);
      const req = h.choice!.request!;
      expect(req.type).toBe("order");
      expect("options" in req && req.options.map((o) => o.defId)).toEqual([expected]);
    }
  });
});

describe("moving given DON!! (R6)", () => {
  it("OP07-001 Dragon moves given DON!! from several cards onto one Character, taking them off the sources (#1197)", () => {
    // OP07-001: "[Activate: Main] [Once Per Turn] Give up to 2 total of your currently given DON!! cards to 1 of your Characters."
    const h = new Harness({ leaders: ["OP07-001", "ST01-001"] });
    const [a, b, c] = h.field(0, "ST01-003", "ST01-003", "ST01-003");
    h.don(0, 4);
    h.attach(0, a!, 1);
    h.attach(0, b!, 1);
    h.act(0, { type: "activate_ability", sourceId: h.state.players[0].leader.id, abilityId: "op07-001#m0" });
    h.forced();
    if (h.choice) h.pick(a!.id, b!.id);
    if (h.choice) h.pick(c!.id);
    const p = h.state.players[0];
    expect(h.choice).toBeUndefined();
    expect(p.characters.map((x) => x.attachedDonIds.length)).toEqual([0, 0, 2]);
    expect(p.attachedDons.filter((d) => d.attachedTo === c!.id).length).toBe(2);
    expect(p.attachedDons.filter((d) => d.attachedTo === a!.id || d.attachedTo === b!.id).length).toBe(0);
  });
});

describe("set DON!! active and rest DON!! (R8)", () => {
  it("OP13-028 Shanks readies the rested DON!! its own cost just rested (#1197)", () => {
    // OP13-028 (cost 10): "[On Play] Set all of your DON!! cards as active."
    const h = new Harness();
    h.hand(0, "OP13-028");
    h.don(0, 10);
    h.play(0, "OP13-028");
    h.forced();
    expect(h.state.players[0].costArea.filter((d) => d.rested)).toHaveLength(0);
    expect(h.state.players[0].costArea).toHaveLength(10);
  });

  it("OP06-035 Hody Jones rests exactly the DON!! and the Character picked, not other DON!! (#1197)", () => {
    // OP06-035: "[On Play] Rest up to a total of 2 of your opponent's Characters or DON!! cards."
    const h = new Harness({ leaders: ["ST01-001", "ST01-001"] });
    h.hand(0, "OP06-035");
    h.don(0, 7);
    h.don(1, 3);
    const [victim] = h.field(1, FILLER);
    h.play(0, "OP06-035");
    const options = (h.choice!.request as { options: { id: string; defId: string; instanceId?: string }[] }).options;
    expect(options.map((o) => o.defId).sort()).toEqual(["DON", "DON", "DON", FILLER]);
    h.pick("Active DON!!", victim!.id);
    const p = h.state.players[1];
    expect(p.characters[0]!.rested).toBe(true);
    expect(p.costArea.filter((d) => d.rested)).toHaveLength(1);
    expect(p.costArea.filter((d) => !d.rested)).toHaveLength(2);
  });
});

describe("replacement limited to a source type (R10)", () => {
  // PRB02-006 Zoro (seat 1): "[Opponent's Turn] If this Character would be rested by your opponent's Character's effect, you may rest 1 of your other Characters instead."
  function restZoroWith(attacker: string) {
    const h = new Harness();
    const [zoro] = h.field(1, "PRB02-006");
    h.field(1, FILLER);
    h.hand(0, attacker);
    h.don(0, 3);
    h.play(0, attacker);
    h.pick(zoro!.id);
    return h;
  }

  it("PRB02-006 asks to rest another Character instead when an opposing Character's effect would rest it (#1197)", () => {
    // OP01-033 (Character, 3 cost): "[On Play] Rest up to 1 of your opponent's Characters with a cost of 4 or less."
    const h = restZoroWith("OP01-033");
    expect(h.choice?.seat).toBe(1);
    expect(h.choice?.request?.type).toBe("confirm");
    expect(h.state.players[1].characters[0]!.rested).toBe(false);
  });

  it("PRB02-006 is rested normally by an Event's effect, which is not a Character's effect (#1197)", () => {
    // OP02-047 (Event, 1 cost): "[Main] Rest up to 1 of your opponent's Characters with a cost of 4 or less."
    const h = restZoroWith("OP02-047");
    expect(h.choice).toBeUndefined();
    expect(h.state.players[1].characters[0]!.rested).toBe(true);
  });
});

describe("place at the top or bottom of the deck (R9)", () => {
  it("OP08-049 puts the revealed card back at the end that was chosen (#1197)", () => {
    // OP08-049 (cost 4): "[On Play] Reveal 1 card from the top of your deck and place it at the top or bottom of your deck."
    for (const [label, edge] of [["Top", "top"], ["Bottom", "bottom"]] as const) {
      const h = new Harness();
      h.hand(0, "OP08-049");
      h.don(0, 4);
      h.deckTop(0, "ST01-004", "ST01-005");
      const before = [...h.state.players[0].deck];
      h.play(0, "OP08-049");
      expect(h.choice!.request!.type).toBe("mode");
      h.pick(label);
      const deck = h.state.players[0].deck;
      expect(deck).toHaveLength(before.length);
      if (edge === "top") expect(deck[0]).toBe("ST01-004");
      else { expect(deck[deck.length - 1]).toBe("ST01-004"); expect(deck[0]).toBe("ST01-005"); }
    }
  });
});

describe("total power selection limit (R11)", () => {
  // OP05-007 Sabo (cost 6): "[On Play] K.O. up to 2 of your opponent's Characters with a total power of 4000 or less."
  const GAIMON = "EB02-012"; // 1000 power
  const DOMA = "EB01-005"; // 3000 power
  const SAI = "OP01-012"; // 4000 power

  function koPick(first: string, second: string) {
    const h = new Harness();
    h.hand(0, "OP05-007");
    h.don(0, 10);
    h.field(1, first, second);
    h.play(0, "OP05-007");
    const options = (h.choice!.request as { options: { id: string; defId: string }[] }).options;
    const ids = [options.find((o) => o.defId === first)!.id, options.find((o) => o.defId === second && o.id !== options.find((x) => x.defId === first)!.id)!.id];
    return { h, ids };
  }

  it("accepts two Characters whose total power is exactly the limit (#1197)", () => {
    const { h, ids } = koPick(GAIMON, DOMA);
    const r = h.try(0, { type: "resolve_pending_choice", accept: true, selectedOptionIds: ids });
    expect(r.ok).toBe(true);
    expect(r.state.players[1].characters).toHaveLength(0);
  });

  it("rejects two Characters whose total power is one step over the limit (#1197)", () => {
    const { h, ids } = koPick(GAIMON, SAI);
    const r = h.try(0, { type: "resolve_pending_choice", accept: true, selectedOptionIds: ids });
    expect(r.ok).toBe(false);
    expect(r.error?.message).toBe("Total power must be 4000 or less");
    expect(h.state.players[1].characters).toHaveLength(2);
  });
});

describe("negated Characters on the field (R1)", () => {
  // OP03-014: "[When Attacking] Play up to 1 red Character card with a cost of 1 from your hand."
  // OP13-064 Roger: "Your Leader and all of your Characters that do not have a type including "Roger Pirates" have their effects negated."
  function attackWithOp03014(negated: boolean) {
    const h = new Harness();
    const [attacker] = h.field(0, "OP03-014", ...(negated ? ["OP13-064"] : []));
    h.hand(0, FILLER); // ST01-003: red, cost 1
    h.attack(attacker!, "leader");
    return h;
  }

  it("a negated Character's [When Attacking] ability does not trigger, while an un-negated one does (#1197)", () => {
    const free = attackWithOp03014(false);
    free.pick(FILLER);
    expect(free.state.players[0].characters.map((c) => c.defId)).toEqual(["OP03-014", FILLER]);
    expect(free.state.players[0].hand).toHaveLength(0);
    const negated = attackWithOp03014(true);
    expect(negated.choice).toBeUndefined();
    expect(negated.state.players[0].hand.map((c) => c.defId)).toEqual([FILLER]);
  });
});

describe("negated Character K.O.'d (R2)", () => {
  // OP01-080 (4000 power): "[On K.O.] Draw 1 card." OP13-064 Roger negates the owner's non-Roger Pirates Characters.
  function koOp01080(negated: boolean) {
    const h = new Harness();
    const [victim] = h.field(1, "OP01-080", ...(negated ? ["OP13-064"] : []));
    victim!.rested = true;
    h.attack(h.state.players[0].leader, victim!); // 5000 power Leader beats 4000
    h.passBattle();
    return h;
  }

  it("a negated Character's [On K.O.] does not draw, while an un-negated one draws (#1197)", () => {
    const free = koOp01080(false);
    expect(free.state.players[1].characters).toHaveLength(0);
    expect(free.state.players[1].hand).toHaveLength(1);
    const negated = koOp01080(true);
    expect(negated.state.players[1].characters.map((c) => c.defId)).toEqual(["OP13-064"]);
    expect(negated.state.players[1].trash.map((c) => c)).toContain("OP01-080");
    expect(negated.state.players[1].hand).toHaveLength(0);
  });

  it("a negated Character's \"when this is K.O.'d\" ability does not trigger, while an un-negated one does (#1197)", () => {
    // OP03-015 (2000 power): "[Opponent's Turn] When this Character is KO'd, give up to 1 of your opponent's Leader or Character cards -2000 power ..."
    const run = (negated: boolean) => {
      const h = new Harness();
      const [victim] = h.field(1, "OP03-015", ...(negated ? ["OP13-064"] : []));
      victim!.rested = true;
      h.attack(h.state.players[0].leader, victim!);
      h.passBattle();
      return h;
    };
    const free = run(false);
    expect(free.state.players[1].characters).toHaveLength(0);
    expect(free.choice?.cardDefId).toBe("OP03-015");
    const negated = run(true);
    expect(negated.state.players[1].trash).toContain("OP03-015");
    expect(negated.choice).toBeUndefined();
  });
});

describe("end-of-battle delayed effects (R3)", () => {
  it("OP02-064's end-of-battle effect is cleared with the battle and an end-of-turn effect queued earlier survives it (#1197)", () => {
    // OP14-031 (cost 4): "[On Play] ... set up to 5 of your DON!! cards as active at the end of this turn."
    // OP02-064 Bentham: "[DON!! x1] [When Attacking] You may trash 1 card from your hand: ... at the end of this battle, place this Character at the bottom of the owner's deck."
    const h = new Harness();
    h.hand(0, "OP14-031");
    h.don(0, 10);
    h.play(0, "OP14-031");
    h.forced();
    const [bentham] = h.field(0, "OP02-064");
    const [second] = h.field(0, FILLER);
    h.attach(0, bentham!, 1);
    h.hand(0, "ST01-004");
    expect(h.state.delayed.map((d) => d.when)).toEqual(["end_of_turn"]);
    h.attack(bentham!, "leader");
    h.accept().pick("ST01-004");
    h.pick(); // "Place up to 1 Character with a cost of 2 or less": none
    expect(h.state.delayed.map((d) => d.when).sort()).toEqual(["end_of_battle", "end_of_turn"]);
    h.passBattle();
    expect(h.state.phase).toBe("main");
    expect(h.state.players[0].deck.at(-1)).toBe("OP02-064");
    expect(h.state.delayed.map((d) => d.when)).toEqual(["end_of_turn"]);
    // The next battle does not run Bentham's effect again.
    const deckBefore = h.state.players[0].deck.length;
    h.attack(h.state.players[0].characters.find((c) => c.id === second!.id)!, "leader");
    h.passBattle();
    expect(h.state.players[0].deck.length).toBe(deckBefore);
    expect(h.state.delayed.map((d) => d.when)).toEqual(["end_of_turn"]);
  });
});

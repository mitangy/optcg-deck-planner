import { describe, expect, it } from "vitest";
import { powerOf } from "../engine/queries.js";
import { addModifier } from "../engine/modifiers.js";
import { Harness } from "../testing/harness.js";
import type { Seat } from "../types.js";

// Behavior pinned from the 2026-10-12 weekly Stryker run (#PRNUM).

const RAYLEIGH = "OP08-118"; // 8-cost, [On Play] gives 1 of your opponent's Characters -3000 power until the end of your opponent's next turn.
const KEEP_OUT = "OP07-018"; // 1-cost Event, [Counter] +2000 power to a {Revolutionary Army} Character until the end of your next turn.
const REVOLUTIONARY = "OP05-012"; // {Revolutionary Army} Character, no [Trigger]
const THATCH = "OP03-005"; // 1-cost, [Activate: Main] +2000 power during this turn. Then, trash this Character at the end of this turn.
const PRB_LUFFY = "PRB02-005"; // 4-cost, [Your Turn] [On Play] If your Leader is multicolored and the opponent has 7 or less DON!!: they rest 1 active DON!! at the start of their next Main Phase.
const MULTICOLOR_LEADER = "EB01-001"; // red/green
const BENTHAM = "OP02-064"; // 5-cost, [DON!! x1] [When Attacking] ... Then, at the end of this battle, place this Character at the bottom of the owner's deck.
const HAWKINS = "ST02-010"; // 6000, [DON!! x1] [Once Per Turn] [Your Turn] If this Character battles your opponent's Character, set this card as active.
const BENTHAM_KO = "ST08-013"; // 6000, [DON!! x1] At the end of a battle in which this Character battles your opponent's Character, you may KO that Character.
const ROBIN = "ST01-008"; // vanilla 5000
const KAROO = "ST01-003"; // vanilla 3000
const KAIDO = "ST09-004"; // 5000, [DON!! x1] If you have 2 or less Life cards, this Character cannot be KO'd in battle.
const YASAKANI = "OP02-118"; // Event, [Counter] You may trash 1 card from your hand: Select up to 1 of your Characters. It cannot be KO'd during this battle.
const UTA_FILM = "ST08-002"; // 3000, This Character cannot be KO'd in battle by Leaders.
const SMOKER = "P-025"; // 5000, [DON!! x1] This Character cannot be KO'd in battle by Characters without a <Special> attribute.
const MARCO = "OP01-023"; // 5000, <Special> attribute, vanilla
const ROBIN_EB = "EB03-055"; // 8000, [Opponent's Turn] [On K.O.] You may deal 1 damage to your opponent.
const ADIO = "OP03-002"; // 5000, [DON!! x1] [When Attacking] The opponent cannot activate a [Blocker] Character that has 2000 or less power during this battle.
const MORLEY = "OP02-061"; // 5000, [When Attacking] If you have 1 or less cards in your hand, the opponent cannot activate the [Blocker] of any Character with a cost of 5 or less.
const USOPP = "ST01-002"; // 2000, [DON!! x2] [When Attacking] The opponent cannot activate a [Blocker] Character that has 5000 or more power during this battle.
const HANCOCK = "OP16-032"; // 9000, printed [Unblockable]
const BOW_DOWN = "OP13-057"; // Event, [Main] You may rest 1 DON!!: If you have 1 or less Life, the opponent cannot activate [Blocker] whenever your Leader attacks this turn.
const BLUENO = "EB01-017"; // [Blocker] cost 2, 2000 power
const HIGURASHI = "OP01-100"; // [Blocker] cost 2, 3000 power
const HINA = "OP02-110"; // [Blocker] cost 5, 6000 power
const WANDA = "EB03-019"; // [Blocker] cost 6, 7000 power
const BLOCKER_4000 = "OP02-038"; // [Blocker] cost 3, 4000 power
const BLOCKER_5000 = "OP04-104"; // [Blocker] 5000 power
const NEWGATE = "OP08-043"; // 10-cost, [On Play] If your Leader is Whitebeard Pirates and you have 2 or less Life: the opponent's Characters cannot attack unless they trash 2 cards from hand, until the end of their next turn.
const NEWGATE_LEADER = "OP02-001"; // {Whitebeard Pirates} Leader
const CURIEL = "OP03-004"; // 4000, cannot attack a Leader on the turn in which it is played; [DON!! x1] has [Rush].
const KOUSHIROU = "OP06-026"; // [On Play] Set a <Slash> Character active. Then, you cannot attack a Leader during this turn.
const BLACK_MARIA = "OP08-074"; // [Activate: Main] [Once Per Turn] Add up to 5 DON!! rested. Then, at the end of this turn, return DON!! from your field until you have the same number as your opponent.
const SHIRAHOSHI = "OP05-082"; // 1-cost, [Activate: Main] You may rest this Character and place 2 cards from your trash at the bottom of your deck: ...
const MORIA_LEADER = "OP14-080"; // [Activate: Main] [Once Per Turn] You may KO 1 of your {Thriller Bark Pirates} type Characters: ...
const PERONA = "ST12-005"; // {Thriller Bark Pirates} Character, no text
const LOLA = "OP06-094"; // {Thriller Bark Pirates} Character, no text
const ALVIDA = "OP15-003"; // [Activate: Main] [Once Per Turn] You may give 1 of your opponent's rested DON!! to 1 of your opponent's Characters: ...
const UTA = "OP02-120"; // 8-cost, [On Play] DON!! -2: Your Leader and all of your Characters gain +1000 power until the start of your next turn.

function leaderPower(h: Harness, seat: Seat): number {
  return powerOf(h.state, seat, h.state.players[seat].leader);
}

/** End the active seat's turn; the other seat's turn begins. */
function endTurn(h: Harness): void {
  h.act(h.state.activeSeat, { type: "end_turn" });
}

/** Advance to the start of `seat`'s next turn. */
function toTurnOf(h: Harness, seat: Seat): void {
  while (h.state.activeSeat !== seat) endTurn(h);
}

describe("duration expiry", () => {
  for (const seat of [0, 1] as const) {
    it(`"until the start of your next turn" lasts through the opponent's turn and ends at the start of seat ${seat}'s next turn (#PRNUM)`, () => {
      const h = new Harness();
      toTurnOf(h, seat);
      const base = leaderPower(h, seat);
      h.hand(seat, UTA);
      h.don(seat, 10);
      h.play(seat, UTA).accept().pick("o0", "o1");
      expect(leaderPower(h, seat)).toBe(base + 1000);
      endTurn(h);
      // The opponent's whole turn: still buffed.
      expect(h.state.activeSeat).toBe(seat === 0 ? 1 : 0);
      expect(leaderPower(h, seat)).toBe(base + 1000);
      endTurn(h);
      // The seat's own next turn has begun: the buff is gone already, not at its end.
      expect(h.state.activeSeat).toBe(seat);
      expect(leaderPower(h, seat)).toBe(base);
    });
  }

  for (const seat of [0, 1] as const) {
    it(`"until the end of your opponent's next turn" applied by seat ${seat} ends after the other seat's turn (#PRNUM)`, () => {
      const h = new Harness();
      toTurnOf(h, seat);
      const opp: Seat = seat === 0 ? 1 : 0;
      const [target] = h.field(opp, UTA);
      const base = powerOf(h.state, opp, target!);
      h.hand(seat, RAYLEIGH);
      h.don(seat, 10);
      h.play(seat, RAYLEIGH).pick(UTA);
      expect(powerOf(h.state, opp, target!)).toBe(base - 3000);
      endTurn(h);
      // The opponent's turn is the one that ends it: still reduced during it.
      expect(powerOf(h.state, opp, target!)).toBe(base - 3000);
      endTurn(h);
      // Back on the applying seat's turn the reduction is gone; it must not last through that turn too.
      expect(h.state.activeSeat).toBe(seat);
      expect(powerOf(h.state, opp, target!)).toBe(base);
    });

    it(`"until the end of your next turn" lasts through seat ${seat}'s next turn and ends with it (#PRNUM)`, () => {
      const h = new Harness();
      const opp: Seat = seat === 0 ? 1 : 0;
      toTurnOf(h, opp);
      const [ally] = h.field(seat, REVOLUTIONARY);
      const [attacker] = h.field(opp, REVOLUTIONARY);
      const base = powerOf(h.state, seat, ally!);
      h.hand(seat, KEEP_OUT);
      h.don(seat, 2);
      h.attack(attacker!, "leader");
      h.act(seat, { type: "pass_block" });
      h.act(seat, { type: "counter_event", handIndex: 0 }).pick(REVOLUTIONARY);
      h.act(seat, { type: "pass_counter" });
      h.resolveLifeChecks();
      endTurn(h);
      expect(h.state.activeSeat).toBe(seat);
      // The seat's own next turn has begun: the buff still applies until that turn ends.
      expect(powerOf(h.state, seat, ally!)).toBe(base + 2000);
      endTurn(h);
      expect(powerOf(h.state, seat, ally!)).toBe(base);
    });
  }
});

describe("delayed effects and end-of-battle triggers", () => {
  it("\"at the end of this turn\" fires at the end of its own turn, once, and leaves nothing queued (#PRNUM)", () => {
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

  it("\"at the start of your opponent's next Main Phase\" waits through the end of the turn and rests their DON!! only then (#PRNUM)", () => {
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

  it("\"at the end of this battle\" fires when the battle ends, not before and not at the end of the turn (#PRNUM)", () => {
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

  it("an attacker's \"battles your opponent's Character\" trigger fires for a Character target and not for a Leader target (#PRNUM)", () => {
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

  it("a defender's \"battles your opponent's Character\" trigger fires for a Character attacker and not for a Leader attacker (#PRNUM)", () => {
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

describe("K.O. protection in battle", () => {
  /** Seat 1's 7000-power Character attacks seat 0's rested 5000-power `defenderDef`; seat 0 passes block. Returns the harness at the counter step. */
  function attackDefender(defenderDef: string, setup: (h: Harness, defender: ReturnType<Harness["card"]>) => void, attackerDef: string = ROBIN): Harness {
    const h = new Harness();
    const [defender] = h.field(0, defenderDef);
    defender!.rested = true;
    setup(h, defender!);
    endTurn(h);
    const attacker = attackerDef === "leader" ? h.state.players[1].leader : h.field(1, attackerDef)[0]!;
    h.attach(1, attacker, 2);
    h.attack(attacker, h.state.players[0].characters[0]!);
    h.act(0, { type: "pass_block" });
    return h;
  }

  for (const life of [2, 3]) {
    it(`"cannot be K.O.'d in battle" holds while its condition is met: Kaido with ${life} Life ${life <= 2 ? "survives" : "is K.O.'d"} (#PRNUM)`, () => {
      const h = attackDefender(KAIDO, (hh, kaido) => {
        hh.attach(0, kaido, 1);
        hh.life(0, ...Array.from({ length: life }, () => ROBIN));
      });
      h.act(0, { type: "pass_counter" });
      expect(h.state.players[0].characters.map((c) => c.defId)).toEqual(life <= 2 ? [KAIDO] : []);
    });
  }

  for (const counter of [true, false]) {
    it(`"cannot be K.O.'d during this battle" from a Counter Event ${counter ? "stops" : "(not played) does not stop"} the battle K.O. (#PRNUM)`, () => {
      const h = attackDefender(ROBIN, (hh) => {
        hh.hand(0, YASAKANI, KAROO);
        hh.don(0, 1);
      });
      if (counter) h.act(0, { type: "counter_event", handIndex: 0 }).accept().pick(KAROO).pick(ROBIN);
      h.act(0, { type: "pass_counter" });
      expect(h.state.players[0].characters.map((c) => c.defId)).toEqual(counter ? [ROBIN] : []);
    });
  }

  for (const attackerKind of ["leader", "character"] as const) {
    it(`"cannot be K.O.'d in battle by Leaders" ${attackerKind === "leader" ? "stops a Leader's battle K.O." : "does not stop a Character's battle K.O."} (#PRNUM)`, () => {
      const h = attackDefender(UTA_FILM, () => {}, attackerKind === "leader" ? "leader" : ROBIN);
      h.act(0, { type: "pass_counter" });
      expect(h.state.players[0].characters.map((c) => c.defId)).toEqual(attackerKind === "leader" ? [UTA_FILM] : []);
    });
  }

  for (const [attacker, label, protectedFromIt] of [[ROBIN, "a Character without <Special>", true], [MARCO, "a <Special> Character", false], ["leader", "a Leader", false]] as const) {
    it(`"cannot be K.O.'d in battle by Characters without <Special>" ${protectedFromIt ? "stops" : "does not stop"} the battle K.O. by ${label} (#PRNUM)`, () => {
      const h = attackDefender(SMOKER, (hh, smoker) => hh.attach(0, smoker, 1), attacker);
      h.act(0, { type: "pass_counter" });
      expect(h.state.players[0].characters.map((c) => c.defId)).toEqual(protectedFromIt ? [SMOKER] : []);
    });
  }
});

describe("effect damage", () => {
  /** Seat 0's Leader K.O.s seat 1's rested EB03-055; seat 1 takes the optional 1 damage. Seat 0 has `life` Life cards. */
  function koRobinAndDamage(life: string[]): Harness {
    const h = new Harness();
    const [robin] = h.field(1, ROBIN_EB);
    robin!.rested = true;
    h.life(0, ...life);
    h.attach(0, h.state.players[0].leader, 4);
    h.attack(h.state.players[0].leader, robin!).passBattle();
    expect(h.choice?.seat).toBe(1);
    h.accept(1);
    return h;
  }

  it("effect damage takes exactly one Life card and the game goes on (#PRNUM)", () => {
    const h = koRobinAndDamage([KAROO, ROBIN]);
    h.decline(0); // the Life check of the card taken
    expect(h.state.players[0].life).toEqual([ROBIN]);
    expect(h.choice).toBeUndefined();
    expect(h.state.winner).toBeNull();
    expect(h.state.phase).toBe("main");
  });

  it("taking the last Life card to effect damage does not lose the game (#PRNUM)", () => {
    const h = koRobinAndDamage([KAROO]);
    h.decline(0);
    expect(h.state.players[0].life).toEqual([]);
    expect(h.choice).toBeUndefined();
    expect(h.state.winner).toBeNull();
    expect(h.state.phase).toBe("main");
  });

  it("effect damage at 0 Life wins the game for the player who dealt it (#PRNUM)", () => {
    const h = koRobinAndDamage([]);
    expect(h.state.winner).toBe(1);
    expect(h.state.phase).toBe("game_over");
  });
});

describe("who may block", () => {
  /** Defending seat 1's Characters that could declare a block now, by definition id. */
  function blockers(h: Harness): string[] {
    return h
      .legal(1)
      .flatMap((i) => (i.type === "declare_block" ? [h.state.players[1].characters.find((c) => c.id === i.blockerId)!.defId] : []))
      .sort();
  }

  /** Seat 0's `attacker` (with `don` attached) attacks seat 1's Leader; seat 1 has `defenders` on the field. */
  function attackIntoBlockers(attackerDef: string, don: number, defenders: string[], setup: (h: Harness) => void = () => {}): Harness {
    const h = new Harness();
    const [attacker] = h.field(0, attackerDef);
    h.attach(0, attacker!, don);
    h.field(1, ...defenders);
    setup(h);
    h.attack(attacker!, "leader");
    expect(h.state.phase).toBe("block");
    return h;
  }

  it("\"cannot activate a [Blocker] with N power or less\" stops exactly N and below (#PRNUM)", () => {
    const h = attackIntoBlockers(ADIO, 1, [BLUENO, HIGURASHI]);
    // 2000 power is stopped, 3000 power is not.
    expect(blockers(h)).toEqual([HIGURASHI]);
  });

  it("\"cannot activate a [Blocker] with N power or more\" stops exactly N and above (#PRNUM)", () => {
    const h = attackIntoBlockers(USOPP, 2, [BLOCKER_4000, BLOCKER_5000, WANDA]);
    expect(blockers(h)).toEqual([BLOCKER_4000]);
  });

  it("\"cannot activate the [Blocker] of a Character with a cost of N or less\" stops exactly cost N and below (#PRNUM)", () => {
    const h = attackIntoBlockers(MORLEY, 0, [HIGURASHI, HINA, WANDA]);
    // Cost 2 and cost 5 are stopped; cost 6 is not.
    expect(blockers(h)).toEqual([WANDA]);
  });

  it("[Unblockable] alone stops every block (#PRNUM)", () => {
    const h = attackIntoBlockers(HANCOCK, 0, [HIGURASHI, WANDA]);
    expect(blockers(h)).toEqual([]);
  });

  it("\"your opponent cannot activate [Blocker]\" without the keyword stops every block (#PRNUM)", () => {
    const h = new Harness();
    h.hand(0, BOW_DOWN);
    h.don(0, 2);
    h.life(0, KAROO);
    h.field(1, HIGURASHI, WANDA);
    h.play(0, BOW_DOWN);
    h.accept();
    h.forced();
    h.attack(h.state.players[0].leader, "leader");
    expect(h.state.phase).toBe("block");
    expect(blockers(h)).toEqual([]);
  });

  it("with no block restriction in play both Blockers may block (#PRNUM)", () => {
    const h = attackIntoBlockers(ROBIN, 0, [HIGURASHI, WANDA]);
    expect(blockers(h)).toEqual([WANDA, HIGURASHI].sort());
  });
});

describe("who may attack", () => {
  function attackTargets(h: Harness, seat: 0 | 1, attackerId: string): string[] {
    return h
      .legal(seat)
      .flatMap((i) => (i.type === "declare_attack" && i.attackerId === attackerId ? [i.target.kind === "leader" ? "leader" : "character"] : []))
      .sort();
  }

  for (const hand of [1, 2]) {
    it(`attack hand tax of 2: a hand of ${hand} card${hand === 1 ? "" : "s"} ${hand === 2 ? "may" : "may not"} attack (#PRNUM)`, () => {
      const h = new Harness({ leaders: [NEWGATE_LEADER, "ST01-001"] });
      h.life(0, KAROO, KAROO);
      h.hand(0, NEWGATE);
      h.don(0, 10);
      const [attacker] = h.field(1, ROBIN);
      h.play(0, NEWGATE);
      endTurn(h);
      h.clearHands(); // drop the Draw Phase card
      h.hand(1, ...Array.from({ length: hand }, () => KAROO));
      const intent = { type: "declare_attack" as const, attackerId: attacker!.id, target: { kind: "leader" as const } };
      expect(h.try(1, intent).ok).toBe(hand === 2);
      // Only the selected Characters are taxed, not the Leader.
      expect(h.try(1, { ...intent, attackerId: h.state.players[1].leader.id }).ok).toBe(true);
    });
  }

  it("a Character that cannot attack a Leader the turn it is played may still attack a rested Character (#PRNUM)", () => {
    const h = new Harness();
    const [karoo] = h.field(1, KAROO);
    karoo!.rested = true;
    h.hand(0, CURIEL);
    h.don(0, 3);
    h.play(0, CURIEL);
    const curiel = h.find(0, CURIEL)!;
    h.attach(0, curiel, 1); // [DON!! x1] gives [Rush]
    expect(attackTargets(h, 0, curiel.id)).toEqual(["character"]);
    // The Leader is not restricted.
    expect(attackTargets(h, 0, h.state.players[0].leader.id)).toEqual(["character", "leader"]);
  });

  it("\"you cannot attack a Leader during this turn\" applies to the Leader and Characters that were already there (#PRNUM)", () => {
    const h = new Harness();
    const [karoo] = h.field(1, KAROO);
    karoo!.rested = true;
    const [robin] = h.field(0, ROBIN);
    h.hand(0, KOUSHIROU);
    h.don(0, 3);
    h.play(0, KOUSHIROU);
    expect(h.choice).toBeUndefined(); // no <Slash> Character to set active
    expect(attackTargets(h, 0, robin!.id)).toEqual(["character"]);
    expect(attackTargets(h, 0, h.state.players[0].leader.id)).toEqual(["character"]);
  });
});

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

  it("returns rested DON!! before active DON!! (#PRNUM)", () => {
    // 2 active + 8 rested after Black Maria adds 5; the opponent has 8, so 2 go back and the active pair stays.
    const h = endOfTurnReturn((hh) => hh.don(0, 2, 3), 8);
    const p = h.state.players[0];
    expect(p.costArea.filter((d) => !d.rested)).toHaveLength(2);
    expect(p.costArea.filter((d) => d.rested)).toHaveLength(6);
    expect(p.donDeck).toHaveLength(2);
    // DON!! in the DON!! deck are active.
    expect(p.donDeck.some((d) => d.rested)).toBe(false);
  });

  it("returns active DON!! once no rested DON!! is left (#PRNUM)", () => {
    // 5 active + 5 rested after Black Maria adds 5; the opponent has 3, so all 5 rested go and 2 of the 5 active.
    const h = endOfTurnReturn((hh) => hh.don(0, 5), 3);
    const p = h.state.players[0];
    expect(p.costArea.filter((d) => d.rested)).toHaveLength(0);
    expect(p.costArea.filter((d) => !d.rested)).toHaveLength(3);
    expect(p.donDeck).toHaveLength(7);
  });

  it("falls back to attached DON!! when the cost area runs out (#PRNUM)", () => {
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

  it("placing N cards from the trash at the bottom of the deck needs N in the trash (#PRNUM)", () => {
    for (const trashed of [1, 2, 3]) {
      const h = new Harness();
      const [shirahoshi] = h.field(0, SHIRAHOSHI);
      h.trash(0, ...Array.from({ length: trashed }, () => KAROO));
      expect(canActivate(h, 0, shirahoshi!.id, "op05-082#0")).toBe(trashed >= 2);
    }
  });

  it("a K.O. cost cannot pick a Character that cannot be K.O.'d, by itself or by effects (#PRNUM)", () => {
    for (const [protection, payable] of [[null, true], ["cannot_be_ko", false], ["cannot_be_ko_by_effect", false]] as const) {
      const h = new Harness({ leaders: [MORIA_LEADER, "ST01-001"] });
      const [perona] = h.field(0, PERONA);
      if (protection) addModifier(h.state, 0, undefined, { kind: "card", id: perona!.id }, { type: "restrict", restriction: protection }, { kind: "end_of_turn", turn: h.state.turnNumber });
      expect(canActivate(h, 0, h.state.players[0].leader.id, "op14-080#0")).toBe(payable);
    }
  });

  it("a K.O. cost is payable when another Character can be K.O.'d (#PRNUM)", () => {
    const h = new Harness({ leaders: [MORIA_LEADER, "ST01-001"] });
    const [perona] = h.field(0, PERONA, LOLA);
    addModifier(h.state, 0, undefined, { kind: "card", id: perona!.id }, { type: "restrict", restriction: "cannot_be_ko" }, { kind: "end_of_turn", turn: h.state.turnNumber });
    expect(canActivate(h, 0, h.state.players[0].leader.id, "op14-080#0")).toBe(true);
  });

  it("giving the opponent's rested DON!! needs a rested DON!! and one of their Characters (#PRNUM)", () => {
    for (const [rested, characters, payable] of [[1, 1, true], [0, 1, false], [1, 0, false]] as const) {
      const h = new Harness();
      const [alvida] = h.field(0, ALVIDA);
      h.don(1, 3, rested);
      if (characters) h.field(1, KAROO);
      expect(canActivate(h, 0, alvida!.id, "op15-003#m0")).toBe(payable);
    }
  });
});

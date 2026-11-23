import { describe, expect, it } from "vitest";
import { Harness } from "../testing/harness.js";
import type { Intent, Seat } from "../types.js";

const ROBIN = "ST01-008";
const KAROO = "ST01-003";
const KAIDO = "ST09-004";
const YASAKANI = "OP02-118";
const UTA_FILM = "ST08-002";
const SMOKER = "P-025";
const MARCO = "OP01-023";
const ROBIN_EB = "EB03-055";
const ADIO = "OP03-002";
const MORLEY = "OP02-061";
const USOPP = "ST01-002";
const HANCOCK = "OP16-032";
const BOW_DOWN = "OP13-057";
const BLUENO = "EB01-017";
const HIGURASHI = "OP01-100";
const HINA = "OP02-110";
const WANDA = "EB03-019";
const BLOCKER_4000 = "OP02-038";
const BLOCKER_5000 = "OP04-104";
const NEWGATE = "OP08-043";
const NEWGATE_LEADER = "OP02-001";
const CURIEL = "OP03-004";
const KOUSHIROU = "OP06-026";

function endTurn(h: Harness): void {
  h.act(h.state.activeSeat, { type: "end_turn" });
}

describe("K.O. protection in battle", () => {
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
    it(`"cannot be K.O.'d in battle" holds while its condition is met: Kaido with ${life} Life ${life <= 2 ? "survives" : "is K.O.'d"} (#561)`, () => {
      const h = attackDefender(KAIDO, (hh, kaido) => {
        hh.attach(0, kaido, 1);
        hh.life(0, ...Array.from({ length: life }, () => ROBIN));
      });
      h.act(0, { type: "pass_counter" });
      expect(h.state.players[0].characters.map((c) => c.defId)).toEqual(life <= 2 ? [KAIDO] : []);
    });
  }

  for (const counter of [true, false]) {
    it(`"cannot be K.O.'d during this battle" from a Counter Event ${counter ? "stops" : "(not played) does not stop"} the battle K.O. (#561)`, () => {
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
    it(`"cannot be K.O.'d in battle by Leaders" ${attackerKind === "leader" ? "stops a Leader's battle K.O." : "does not stop a Character's battle K.O."} (#561)`, () => {
      const h = attackDefender(UTA_FILM, () => {}, attackerKind === "leader" ? "leader" : ROBIN);
      h.act(0, { type: "pass_counter" });
      expect(h.state.players[0].characters.map((c) => c.defId)).toEqual(attackerKind === "leader" ? [UTA_FILM] : []);
    });
  }

  for (const [attacker, label, protectedFromIt] of [[ROBIN, "a Character without <Special>", true], [MARCO, "a <Special> Character", false], ["leader", "a Leader", false]] as const) {
    it(`"cannot be K.O.'d in battle by Characters without <Special>" ${protectedFromIt ? "stops" : "does not stop"} the battle K.O. by ${label} (#561)`, () => {
      const h = attackDefender(SMOKER, (hh, smoker) => hh.attach(0, smoker, 1), attacker);
      h.act(0, { type: "pass_counter" });
      expect(h.state.players[0].characters.map((c) => c.defId)).toEqual(protectedFromIt ? [SMOKER] : []);
    });
  }
});

describe("effect damage", () => {
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

  it("effect damage takes exactly one Life card and the game goes on (#561)", () => {
    const h = koRobinAndDamage([KAROO, ROBIN]);
    h.decline(0);
    expect(h.state.players[0].life).toEqual([ROBIN]);
    expect(h.choice).toBeUndefined();
    expect(h.state.winner).toBeNull();
    expect(h.state.phase).toBe("main");
  });

  it("taking the last Life card to effect damage does not lose the game (#561)", () => {
    const h = koRobinAndDamage([KAROO]);
    h.decline(0);
    expect(h.state.players[0].life).toEqual([]);
    expect(h.choice).toBeUndefined();
    expect(h.state.winner).toBeNull();
    expect(h.state.phase).toBe("main");
  });

  it("effect damage at 0 Life wins the game for the player who dealt it (#561)", () => {
    const h = koRobinAndDamage([]);
    expect(h.state.winner).toBe(1);
    expect(h.state.phase).toBe("game_over");
  });
});

describe("who may block", () => {
  function blockers(h: Harness): string[] {
    return h
      .legal(1)
      .flatMap((i) => (i.type === "declare_block" ? [h.state.players[1].characters.find((c) => c.id === i.blockerId)!.defId] : []))
      .sort();
  }

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

  it("\"cannot activate a [Blocker] with N power or less\" stops exactly N and below (#561)", () => {
    const h = attackIntoBlockers(ADIO, 1, [BLUENO, HIGURASHI]);
    expect(blockers(h)).toEqual([HIGURASHI]);
  });

  it("\"cannot activate a [Blocker] with N power or more\" stops exactly N and above (#561)", () => {
    const h = attackIntoBlockers(USOPP, 2, [BLOCKER_4000, BLOCKER_5000, WANDA]);
    expect(blockers(h)).toEqual([BLOCKER_4000]);
  });

  it("\"cannot activate the [Blocker] of a Character with a cost of N or less\" stops exactly cost N and below (#561)", () => {
    const h = attackIntoBlockers(MORLEY, 0, [HIGURASHI, HINA, WANDA]);
    expect(blockers(h)).toEqual([WANDA]);
  });

  it("[Unblockable] alone stops every block (#561)", () => {
    const h = attackIntoBlockers(HANCOCK, 0, [HIGURASHI, WANDA]);
    expect(blockers(h)).toEqual([]);
  });

  it("\"your opponent cannot activate [Blocker]\" without the keyword stops every block (#561)", () => {
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

  it("with no block restriction in play both Blockers may block (#561)", () => {
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
    it(`attack hand tax of 2: a hand of ${hand} card${hand === 1 ? "" : "s"} ${hand === 2 ? "may" : "may not"} attack (#561)`, () => {
      const h = new Harness({ leaders: [NEWGATE_LEADER, "ST01-001"] });
      h.life(0, KAROO, KAROO);
      h.hand(0, NEWGATE);
      h.don(0, 10);
      const [attacker] = h.field(1, ROBIN);
      h.play(0, NEWGATE);
      endTurn(h);
      h.clearHands();
      h.hand(1, ...Array.from({ length: hand }, () => KAROO));
      const intent = { type: "declare_attack" as const, attackerId: attacker!.id, target: { kind: "leader" as const } };
      expect(h.try(1, intent).ok).toBe(hand === 2);
      expect(h.try(1, { ...intent, attackerId: h.state.players[1].leader.id }).ok).toBe(true);
    });
  }

  it("a Character that cannot attack a Leader the turn it is played may still attack a rested Character (#561)", () => {
    const h = new Harness();
    const [karoo] = h.field(1, KAROO);
    karoo!.rested = true;
    h.hand(0, CURIEL);
    h.don(0, 3);
    h.play(0, CURIEL);
    const curiel = h.find(0, CURIEL)!;
    h.attach(0, curiel, 1);
    expect(attackTargets(h, 0, curiel.id)).toEqual(["character"]);
    expect(attackTargets(h, 0, h.state.players[0].leader.id)).toEqual(["character", "leader"]);
  });

  it("\"you cannot attack a Leader during this turn\" applies to the Leader and Characters that were already there (#561)", () => {
    const h = new Harness();
    const [karoo] = h.field(1, KAROO);
    karoo!.rested = true;
    const [robin] = h.field(0, ROBIN);
    h.hand(0, KOUSHIROU);
    h.don(0, 3);
    h.play(0, KOUSHIROU);
    expect(h.choice).toBeUndefined();
    expect(attackTargets(h, 0, robin!.id)).toEqual(["character"]);
    expect(attackTargets(h, 0, h.state.players[0].leader.id)).toEqual(["character"]);
  });
});

describe("legal intents in the counter step", () => {
  const KAROO = "ST01-003";
  const CHOPPER = "ST01-006";
  const REPEL = "ST02-016";
  const NEW_GENESIS = "ST11-004";

  function counterStep(active: number, rested = 0): { intents: Intent[]; hand: string[] } {
    const h = new Harness();
    h.hand(1, KAROO, CHOPPER, REPEL, NEW_GENESIS);
    h.don(1, active, rested);
    h.attack(h.state.players[0].leader, "leader");
    h.act(1, { type: "pass_block" });
    expect(h.state.phase).toBe("counter");
    return { intents: h.legal(1), hand: h.state.players[1].hand.map((c) => c.defId) };
  }

  it("offers a Counter Event when the active DON!! exactly cover its cost (#861)", () => {
    const { intents, hand } = counterStep(2);
    expect(intents.filter((i) => i.type === "counter_event")).toEqual([{ type: "counter_event", handIndex: hand.indexOf(REPEL) }]);
  });

  it("does not offer a Counter Event when the active DON!! are one short of its cost, however many are rested (#861)", () => {
    const { intents } = counterStep(1, 5);
    expect(intents.filter((i) => i.type === "counter_event")).toEqual([]);
  });

  it("offers only Characters with a Counter value as counters, and never an Event without a [Counter] (#861)", () => {
    const { intents, hand } = counterStep(10);
    expect(intents.filter((i) => i.type === "counter_from_hand")).toEqual([{ type: "counter_from_hand", handIndex: hand.indexOf(KAROO) }]);
    expect(intents.filter((i) => i.type === "counter_event")).toEqual([{ type: "counter_event", handIndex: hand.indexOf(REPEL) }]);
  });
});

describe("Stage cards as hand counters (#1421)", () => {
  const FRANKY = "OP18-021";
  const SUNNY = "OP18-075";

  function stageCounterStep(defenderLeader: string): Harness {
    const h = new Harness({ leaders: ["ST01-001", defenderLeader] });
    h.hand(1, SUNNY);
    h.attack(h.state.players[0].leader, "leader");
    h.act(1, { type: "pass_block" });
    expect(h.state.phase).toBe("counter");
    return h;
  }

  it("a Stage in hand counters for +3000 under Franky OP18-021 (#1421)", () => {
    const h = stageCounterStep(FRANKY);
    expect(h.legal(1)).toContainEqual({ type: "counter_from_hand", handIndex: 0 });
    expect(h.view(1).you.hand[0]!.counter).toBe(3000);
    const life = h.state.players[1].life.length;
    h.act(1, { type: "counter_from_hand", handIndex: 0 });
    expect(h.state.players[1].hand).toHaveLength(0);
    expect(h.state.players[1].trash).toContain(SUNNY);
    h.act(1, { type: "pass_counter" });
    expect(h.state.players[1].life.length).toBe(life);
  });

  it("a Stage in hand is not a counter without a Stage-counter Leader (#1421)", () => {
    const h = stageCounterStep("ST01-001");
    expect(h.legal(1).filter((i) => i.type === "counter_from_hand")).toEqual([]);
    expect(h.try(1, { type: "counter_from_hand", handIndex: 0 }).ok).toBe(false);
  });
});

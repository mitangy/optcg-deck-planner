import { applyIntent, listLegalIntents, powerOf, type Intent, type MatchState, type Seat } from "@optcg/rules";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../src/catalog";
import { attackerIds, canAttackPuzzle, counterBattle, counterPuzzle, PLAYABLE_ABILITY_NOTE, PLAYABLE_QUESTION, playableIds, playablePuzzle, powerPuzzle } from "./generators";
import { BIG, board, justPlayed, KAROO, KAROO_LEADER, LUFFY, NEWGATE, rng, VIVI, ZORO_RUSH } from "./testkit";

const catalog = loadCatalog();

/** The battle played out with real Counter cards from the defender's hand: true when the attack still lands. */
function attackLands(state: MatchState, attack: Intent, counterCards: number): boolean {
  const apply = (s: MatchState, intent: Intent, seat: Seat) => {
    const r = applyIntent(s, intent, { seat, rng: rng() });
    if (!r.ok) throw new Error(`${intent.type} rejected: ${r.error?.message}`);
    return r;
  };
  let s = apply(state, attack, 0).state;
  s = apply(s, { type: "pass_block" }, 1).state;
  for (let i = 0; i < counterCards; i += 1) s = apply(s, { type: "counter_from_hand", handIndex: 0 }, 1).state;
  const resolved = apply(s, { type: "pass_counter" }, 1).events.find((e) => e.type === "battle_resolved");
  if (!resolved || resolved.type !== "battle_resolved") throw new Error("no battle resolved");
  return resolved.attackerWon;
}

const attackWith = (state: MatchState, attackerId: string): { intent: Intent; index: number } => {
  const attacks = listLegalIntents(state, 0).filter((i) => i.type === "declare_attack");
  const index = attacks.findIndex((i) => i.type === "declare_attack" && i.attackerId === attackerId);
  return { intent: attacks[index]!, index };
};

describe("counter_needed gold comes from the engine's battle", () => {
  it("is the Counter at which the attack fails: one step less still lands, the gold fails it (#677)", () => {
    const h = board();
    const [attacker] = h.field(0, BIG);
    // Newgate has 2 DON!! attached, which do not count on the opponent's turn; six 1000 Counter cards in hand.
    h.attach(1, h.state.players[1].leader, 2);
    h.hand(1, ...Array.from({ length: 6 }, () => KAROO));
    const { intent, index } = attackWith(h.state, attacker!.id);
    const battle = counterBattle(h.state, index)!;
    // 7000 against 6000: one 1000 Counter makes 7000 against 7000, and the attacker wins ties, so it takes 2000.
    expect(battle.gold).toBe(2000);
    expect(attackLands(h.state, intent, battle.gold / 1000 - 1)).toBe(true);
    expect(attackLands(h.state, intent, battle.gold / 1000)).toBe(false);
  });

  it("asks for a Character target with the same rule, and DON!! on a defending Character adds nothing (#677)", () => {
    const h = board();
    const [attacker] = h.field(0, BIG);
    const [defender] = h.field(1, VIVI);
    defender!.rested = true;
    h.attach(1, defender!, 2);
    h.hand(1, ...Array.from({ length: 6 }, () => KAROO));
    const attacks = listLegalIntents(h.state, 0).filter((i) => i.type === "declare_attack");
    const index = attacks.findIndex((i) => i.type === "declare_attack" && i.attackerId === attacker!.id && i.target.kind === "character");
    const battle = counterBattle(h.state, index)!;
    expect(battle.gold).toBe(4000);
    expect(attackLands(h.state, attacks[index]!, 3)).toBe(true);
    expect(attackLands(h.state, attacks[index]!, 4)).toBe(false);
  });

  it("builds a puzzle from the counter step whose gold is one of the position's battles (#677)", () => {
    const h = board();
    h.field(0, BIG);
    h.attach(1, h.state.players[1].leader, 2);
    h.hand(1, KAROO, VIVI);
    const golds = new Set<number>();
    for (let seed = 1; seed <= 12; seed += 1) {
      const made = counterPuzzle(h.state, catalog, rng(seed));
      if (!made) continue;
      expect(made.type).toBe("counter_needed");
      expect(made.message).toContain("counter step");
      expect(made.message).toContain("Your hand (2)");
      expect(made.tags).toContain("defender-don-idle");
      if (made.gold.mode === "number") golds.add(made.gold.value);
    }
    // Leader against Leader is 5000 against 6000 (needs nothing, so it is rarely asked); Big Karoo against Newgate needs 2000.
    expect([...golds]).toEqual([2000]);
  });
});

describe("power gold is what the engine says right now", () => {
  it("differs from the printed power when DON!! is attached to a card on its owner's turn (#677)", () => {
    const h = board();
    h.attach(0, h.state.players[0].leader, 2);
    const made = powerPuzzle(h.state, catalog, rng(), "modified")!;
    expect(made.tags).toEqual(["modified"]);
    expect(made.question).toContain("your Leader Monkey.D.Luffy (ST01-001)");
    expect(made.gold).toEqual({ key: "power", mode: "number", value: 7000 });
    expect(catalog.cards.get(LUFFY)!.power).toBe(5000);
    expect(powerOf(h.state, 0, h.state.players[0].leader)).toBe(7000);
  });

  it("is the printed power for DON!! on the opponent's card during your turn (#677)", () => {
    const h = board();
    h.attach(1, h.state.players[1].leader, 3);
    const made = powerPuzzle(h.state, catalog, rng(), "idle-don")!;
    expect(made.tags).toEqual(["idle-don"]);
    expect(made.question).toContain("your opponent's Leader Edward.Newgate (OP02-001)");
    expect(made.gold).toEqual({ key: "power", mode: "number", value: 6000 });
  });

  it("includes a Leader's static on a Character (#677)", () => {
    const h = board([KAROO_LEADER, LUFFY]);
    h.field(0, KAROO);
    const made = powerPuzzle(h.state, catalog, rng(), "modified")!;
    expect(made.question).toContain("Karoo (ST01-003)");
    expect(made.gold).toEqual({ key: "power", mode: "number", value: 4000 });
    expect(made.newSet).toBe(true);
  });

  it("does not ask about a card whose name is on the table twice (#677)", () => {
    const h = board([LUFFY, LUFFY]);
    const made = powerPuzzle(h.state, catalog, rng());
    expect(made).toBeNull();
  });
});

describe("playable gold is the engine's legal plays", () => {
  it("leaves out a card that costs more than the active DON!! (#677)", () => {
    const h = board();
    h.hand(0, KAROO, BIG);
    h.don(0, 2);
    expect(playableIds(h.state, 0)).toEqual([KAROO]);
    const made = playablePuzzle(h.state, catalog, rng())!;
    expect(made.gold).toEqual({ key: "cards", mode: "set", value: [KAROO] });
    h.don(0, 5);
    expect(playableIds(h.state, 0).sort()).toEqual([BIG, KAROO]);
  });

  it("does not count rested DON!! toward the cost (#677)", () => {
    const h = board();
    h.hand(0, VIVI, KAROO);
    h.don(0, 1, 5);
    expect(playableIds(h.state, 0)).toEqual([KAROO]);
  });
});

describe("playable question and ability traps (#697)", () => {
  const BUGGY = "OP09-042"; // Leader: [Activate: Main] rest 5 DON!!, trash 1: play a {Cross Guild} Character from hand
  const CROSS_GUILD = "OP09-048"; // Character, cost 6
  const COUNTER_ONLY = "EB01-019"; // Event with only a [Counter]
  const OPTIONAL_COST = "EB01-051"; // Event: [Main] You may trash 2 cards from the top of your deck: ...

  it("is the engine's reading: an Event with a [Main] counts even if its optional cost is unpaid, a [Counter]-only Event does not (#697)", () => {
    const h = board();
    h.hand(0, COUNTER_ONLY, OPTIONAL_COST);
    h.don(0, 5);
    expect(playableIds(h.state, 0)).toEqual([OPTIONAL_COST]);
    expect(playablePuzzle(h.state, catalog, rng(1))!.gold).toEqual({ key: "cards", mode: "set", value: [OPTIONAL_COST] });
  });

  it("keeps a position where a Leader's [Activate: Main] could play a hand card, tags it, and tells the model to leave the ability out (#697)", () => {
    const h = board([BUGGY, NEWGATE]);
    h.hand(0, CROSS_GUILD, CROSS_GUILD);
    h.don(0, 5);
    expect(listLegalIntents(h.state, 0).some((i) => i.type === "activate_ability")).toBe(true);
    // Nothing in the hand is playable by paying its cost (the Character costs 6), so only the trap keeps it from being turned down.
    for (let seed = 1; seed <= 12; seed += 1) {
      const made = playablePuzzle(h.state, catalog, rng(seed))!;
      expect(made, `seed ${seed}`).not.toBeNull();
      expect(made.tags).toEqual(["none-playable", "ability-trap"]);
      expect(made.gold).toEqual({ key: "cards", mode: "set", value: [] });
      expect(made.question).toBe(PLAYABLE_QUESTION + PLAYABLE_ABILITY_NOTE);
    }
  });

  it("adds no note and no tag when no ability could play or discount a hand card (#697)", () => {
    const h = board();
    h.hand(0, KAROO, BIG);
    h.don(0, 2);
    const made = playablePuzzle(h.state, catalog, rng(1))!;
    expect(made.tags).toEqual(["mixed"]);
    expect(made.question).toBe(PLAYABLE_QUESTION);
  });
});

describe("can_attack gold is the engine's legal attackers", () => {
  it("leaves out a Character played this turn that has no Rush, and keeps one with Rush (#677)", () => {
    const h = board();
    const [karoo, vivi, zoro] = h.field(0, KAROO, VIVI, ZORO_RUSH);
    justPlayed(h, vivi!);
    justPlayed(h, zoro!);
    expect(karoo!.summoningSick).toBeFalsy();
    expect(attackerIds(h.state, 0).sort()).toEqual([ZORO_RUSH, KAROO]);
    const made = canAttackPuzzle(h.state, catalog, rng())!;
    expect(made.gold).toEqual({ key: "characters", mode: "set", value: [ZORO_RUSH, KAROO] });
    expect(made.message).toContain("Nefeltari Vivi (ST01-009), active, played this turn");
  });

  it("leaves out a rested Character (#677)", () => {
    const h = board();
    const [karoo] = h.field(0, KAROO, VIVI);
    karoo!.rested = true;
    expect(attackerIds(h.state, 0)).toEqual([VIVI]);
  });

  it("makes no puzzle when two copies of a card differ in whether they can attack (#677)", () => {
    const h = board();
    const [, sickCopy, vivi] = h.field(0, KAROO, KAROO, VIVI);
    justPlayed(h, sickCopy!);
    justPlayed(h, vivi!);
    for (let seed = 1; seed <= 6; seed += 1) expect(canAttackPuzzle(h.state, catalog, rng(seed))).toBeNull();
  });
});

describe("the position text", () => {
  it("names the acting player's hand, both boards, DON!!, Life and the cards' reference lines (#677)", () => {
    const h = board();
    const [, vivi] = h.field(0, KAROO, VIVI);
    justPlayed(h, vivi!);
    h.field(1, BIG);
    h.hand(0, ZORO_RUSH, KAROO);
    h.attach(0, h.state.players[0].leader, 1);
    h.life(1, KAROO, KAROO, KAROO);
    const made = canAttackPuzzle(h.state, catalog, rng())!;
    expect(made).not.toBeNull();
    const text = made.position;
    expect(text).toContain("Your hand (2): Roronoa Zoro (OP01-025); Karoo (ST01-003)");
    expect(text).toContain("Your Leader: Monkey.D.Luffy (ST01-001), active, 1 DON!! attached");
    expect(text).toContain("Your Characters: [Karoo (ST01-003), active] [Nefeltari Vivi (ST01-009), active, played this turn]");
    expect(text).toContain("Opponent's Leader: Edward.Newgate (OP02-001), active");
    expect(text).toContain("Opponent's Characters: [Karoo (EB02-001), active]");
    expect(text).toContain("Opponent's Life: 3");
    expect(text).toContain("Opponent's hand: 0 cards (hidden).");
    expect(text).toContain("Card reference:");
    expect(text).toContain("- EB02-001 Karoo (character, red, cost 5, power 7000");
    expect(text).toContain("- OP01-025 Roronoa Zoro");
    // What the questions ask for is not written down: the board lines carry no power at all.
    expect(text.split("\n").find((l) => l.startsWith("Your Leader:"))).not.toMatch(/power|\d{4}/);
  });
});

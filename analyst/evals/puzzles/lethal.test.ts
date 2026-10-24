import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../src/catalog";
import { answersTo, LETHAL_KEEP, lethalPuzzle, lethalValue } from "./lethal";
import { lethalPool } from "./positions";
import { declineLifeChecks, step } from "./search";
import { BIG, KAROO, rng, VIVI } from "./testkit";
import { listLegalIntents, type MatchState, type Seat } from "@optcg/rules";
import { Harness } from "@optcg/rules/src/testing/harness";

const catalog = loadCatalog();
const ATTACK_LEADER = "OP17-079"; // 5000, static text only
const DEFENDER_LEADER = "ST09-001"; // 5000, static text only
const BLOCKER = "ST01-006"; // [Blocker], 1000
const FILLER = lethalPool(catalog).lifeFiller;

/**
 * Seat 0 attacks with its 5000 Leader and `chars` against a 5000 Leader with `life` Life cards, `field` Characters and a face-up
 * `hand` of Counter cards. Every Character is active and able to attack.
 */
function board(o: { chars?: string[]; don?: number; life?: number; lifeCards?: string[]; field?: string[]; hand?: string[]; mine?: string[]; rested?: number[] }) {
  const h = new Harness({ leaders: [ATTACK_LEADER, DEFENDER_LEADER], deckSize: 20 });
  h.don(0, o.don ?? 0);
  h.don(1, 3);
  if (o.chars?.length) h.field(0, ...o.chars);
  if (o.field?.length) {
    const placed = h.field(1, ...o.field);
    for (const i of o.rested ?? []) placed[i]!.rested = true;
  }
  h.life(1, ...(o.lifeCards ?? Array.from({ length: o.life ?? 1 }, () => FILLER)));
  h.hand(1, ...(o.hand ?? []));
  if (o.mine?.length) h.hand(0, ...o.mine);
  return h.state;
}

describe("lethal gold is the engine's exact minimax", () => {
  it("is lower than the sum of the attacks when a Blocker can take one of them (#685)", () => {
    const found = lethalValue(board({ chars: [BIG], field: [BLOCKER] }))!;
    // Two attackers, one Life: undefended the first hit takes the Life and the second wins (1 + 1); a Blocker stops one of them.
    expect(found).toMatchObject({ value: 1, undefended: 2, ceiling: 2 });
    expect(lethalValue(board({ chars: [BIG] }))).toMatchObject({ value: 2, undefended: 2 });
  });

  it("is lower than the sum of the attacks when a Counter card can stop one of them (#685)", () => {
    // 1000 Counter: not enough for the 7000 Character against the 5000 Leader, so it is kept for the Leader's own 5000 attack.
    expect(lethalValue(board({ chars: [BIG], hand: [KAROO] }))).toMatchObject({ value: 1, undefended: 2 });
    expect(lethalValue(board({ chars: [BIG], hand: [] }))).toMatchObject({ value: 2 });
  });

  it("gives the DON!! to the Character that needs it before it attacks (#685)", () => {
    // The Leader's 5000 ties the 5000 Leader; Vivi's 4000 needs one DON!!.
    const chars = [VIVI];
    expect(lethalValue(board({ chars, life: 2, don: 1 }))).toMatchObject({ value: 2, ceiling: 3 });
    expect(lethalValue(board({ chars, life: 2, don: 0 }))).toMatchObject({ value: 1 });
  });

  it("counts the hit on a Leader with no Life as one more (#685)", () => {
    expect(lethalValue(board({ life: 0 }))).toMatchObject({ value: 1, ceiling: 1 });
    expect(lethalValue(board({ life: 2 }))).toMatchObject({ value: 1, ceiling: 3 });
  });

  it("makes no puzzle when a Life card has a [Trigger], or the attacker has a card to play (#685)", () => {
    // A Life card with a [Trigger] opens a choice when it is taken; Karoo in the attacker's hand could be played.
    expect(lethalValue(board({ lifeCards: ["ST01-014"] }))).toBeNull();
    expect(lethalValue(board({ mine: [KAROO], don: 1 }))).toBeNull();
    expect(lethalValue(board({}))).not.toBeNull();
  });

  it("plays a Counter Event that asks which card gets the power (#685)", () => {
    expect(lethalValue(board({ chars: [BIG], field: [VIVI], hand: ["ST01-014"] }))).toMatchObject({ value: 1, undefended: 2 });
  });

  it("gives up and makes no puzzle when the search runs past its budget (#685)", () => {
    const state = board({ chars: [BIG], field: [BLOCKER], hand: [KAROO] });
    expect(lethalValue(state)).not.toBeNull();
    expect(lethalValue(state, 5)).toBeNull();
    expect(lethalPuzzle(state, catalog, rng(1), 5)).toBeNull();
  });
});

/**
 * The plain search the solver started as: every DON!! count for every attack, every block, every Counter card in every order,
 * the battle played out by the engine, with no memory of positions and nothing skipped.
 */
function plainValue(start: MatchState, undefended: boolean): number {
  const attacker = start.activeSeat;
  const defender = (1 - attacker) as Seat;
  const startLife = start.players[defender].life.length;
  const dealt = (s: MatchState) => startLife - s.players[defender].life.length + (s.winner === attacker ? 1 : 0);
  const main = (s: MatchState): number => {
    if (s.winner !== null) return dealt(s);
    let best = dealt(s);
    const donCount = s.players[attacker].costArea.filter((d) => !d.rested).length;
    for (const attack of listLegalIntents(s, attacker).filter((i) => i.type === "declare_attack")) {
      let ready = s;
      for (let k = 0; k <= donCount; k += 1) {
        if (k > 0) ready = step(ready, listLegalIntents(ready, attacker).find((i) => i.type === "give_don" && i.targetId === (attack as { attackerId: string }).attackerId)!, attacker);
        best = Math.max(best, answer(step(ready, attack, attacker)));
      }
    }
    return best;
  };
  const answer = (s: MatchState): number => {
    const blocks = listLegalIntents(s, defender).filter((i) => i.type === "pass_block" || (!undefended && i.type === "declare_block"));
    return Math.min(...blocks.map((b) => counters(step(s, b, defender))));
  };
  const counters = (s: MatchState): number => {
    if (s.winner !== null || (s.phase === "main" && !s.battle && !s.pendingChoices.length)) return main(s);
    const intents = listLegalIntents(s, defender).filter((i) => i.type === "pass_counter" || (!undefended && (i.type === "counter_from_hand" || i.type === "counter_event")));
    return Math.min(
      ...intents.map((i) => {
        const next = step(s, i, defender);
        if (i.type === "pass_counter") return main(declineLifeChecks(next, defender));
        if (!next.pendingChoices.length) return counters(next);
        return Math.min(...answersTo(next).map((a) => counters(step(next, a, defender))));
      }),
    );
  };
  return main(start);
}

describe("the pruned search gives the plain search's answer (#697)", () => {
  const pool = lethalPool(catalog);
  const DOUBLE = "P-028"; // [Double Attack], 6000
  const BLOCKER_7000 = "EB03-019"; // [Blocker], 7000, Counter 1000
  const EVENT = "ST01-014"; // Counter Event
  const mine = [BIG, VIVI, KAROO, DOUBLE, BIG, VIVI];
  const theirs = [BLOCKER, BLOCKER_7000, BLOCKER, VIVI];
  const hands = [KAROO, BIG, KAROO, EVENT, BLOCKER_7000];

  const STEPS = 9_800;
  const randomBoard = (seed: number) => {
    const r = rng(seed);
    const take = (xs: string[], n: number) => Array.from({ length: n }, () => xs[r.nextInt(xs.length)]!);
    const state = board({ chars: take(mine, 1 + r.nextInt(2)), don: r.nextInt(3), life: 1 + r.nextInt(2), field: take(theirs, r.nextInt(3)), hand: take(hands, r.nextInt(3)) });
    // A rested Character can be attacked and cannot block.
    for (const c of state.players[1].characters) if (r.nextInt(3) === 0) c.rested = true;
    return state;
  };

  const COUNTER_2000 = "OP18-106"; // [Double Attack], 7000, Counter 2000
  // Boards that single out one pruning rule each: a Blocker stronger than the attacked Leader, two kinds of Blocker, two kinds of Counter card.
  const fixed: Record<string, Parameters<typeof board>[0]> = {
    strongBlocker: { chars: [DOUBLE], don: 2, life: 2, field: [BLOCKER_7000] },
    twoBlockers: { chars: [DOUBLE, VIVI], don: 1, life: 2, field: [BLOCKER, BLOCKER_7000] },
    twoCounters: { chars: [BIG, VIVI], don: 2, life: 2, hand: [KAROO, COUNTER_2000] },
    counterAndBlocker: { chars: [DOUBLE, BIG], don: 2, life: 3, field: [BLOCKER_7000], hand: [KAROO, EVENT] },
  };

  it("on boards with several attackers, Blockers, Counter cards and DON!! (#697)", () => {
    expect(pool.heavy).toContain(DOUBLE);
    let matters = 0;
    let doubles = 0;
    const named = Object.entries(fixed).map(([name, o]) => [name, board(o)] as const);
    for (const [name, state] of named) {
      const found = lethalValue(state, 200_000)!;
      expect(found.value, name).toBe(plainValue(state, false));
      expect(found.undefended, name).toBe(plainValue(state, true));
    }
    for (let seed = 1; seed <= 30; seed += 1) {
      const state = randomBoard(seed);
      const found = lethalValue(state, 200_000)!;
      expect(found, `seed ${seed}`).not.toBeNull();
      expect(found.value, `seed ${seed}`).toBe(plainValue(state, false));
      expect(found.undefended, `seed ${seed}`).toBe(plainValue(state, true));
      if (found.value < found.undefended) matters += 1;
      if (state.players[0].characters.some((c) => c.defId === DOUBLE)) doubles += 1;
    }
    // The boards must be ones where the defender and the DON!! count change the number, or agreement proves nothing.
    expect(matters).toBeGreaterThan(5);
    expect(doubles).toBeGreaterThan(3);
  }, 60_000);

  it("spends few engine steps on a board with twin Characters, a rested one to attack and many ways to spend DON!! (#697)", () => {
    const state = board({ chars: [BIG, VIVI, VIVI, DOUBLE], don: 4, life: 3, field: [BLOCKER, BLOCKER_7000, VIVI], rested: [2], hand: [KAROO, KAROO, EVENT] });
    const found = lethalValue(state, 80_000)!;
    expect(found).not.toBeNull();
    expect(found.steps).toBeLessThan(STEPS);
  });
});

describe("the lethal puzzle", () => {
  it("shows the opponent's hand face up and says what the Life cards are (#685)", () => {
    const made = lethalPuzzle(board({ chars: [BIG], hand: [KAROO] }), catalog, rng(1))!;
    expect(made.type).toBe("lethal");
    expect(made.gold).toEqual({ key: "damage", mode: "number", value: 1 });
    expect(made.message).toContain("Opponent's hand (1): Karoo (ST01-003)");
    expect(made.message).toContain("Your opponent's hand is shown face up for this puzzle.");
    expect(made.message).toContain("has no [Trigger]");
    expect(made.message).toContain(`- ${FILLER} `);
    expect(made.message).toContain("Your opponent will defend as well as they can.");
    expect(made.tags[0]).toBe("defender-matters");
  });

  it("mostly turns down boards where nothing can be dealt, since a defender holds it all (#685)", () => {
    // The Leader's only attack is taken by the Blocker: 0 damage, where an undefended turn deals 1.
    const state = board({ field: [BLOCKER] });
    expect(lethalValue(state)).toMatchObject({ value: 0, undefended: 1 });
    const made = Array.from({ length: 30 }, (_, i) => lethalPuzzle(state, catalog, rng(i + 1))).filter(Boolean);
    expect(LETHAL_KEEP.none).toBeLessThan(0.3);
    expect(made.length).toBeGreaterThan(0);
    expect(made.length).toBeLessThanOrEqual(12);
  });

  it("mostly turns down boards where the defender cannot change the outcome (#685)", () => {
    const state = board({ chars: [BIG], life: 2 });
    expect(lethalValue(state)).toMatchObject({ value: 2, undefended: 2 });
    const made = Array.from({ length: 30 }, (_, i) => lethalPuzzle(state, catalog, rng(i + 1))).filter(Boolean);
    expect(made.length).toBeLessThanOrEqual(12);
  });
});

import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../src/catalog";
import { LETHAL_KEEP, lethalPuzzle, lethalValue } from "./lethal";
import { lethalPool } from "./positions";
import { BIG, KAROO, rng, VIVI } from "./testkit";
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
function board(o: { chars?: string[]; don?: number; life?: number; lifeCards?: string[]; field?: string[]; hand?: string[]; mine?: string[] }) {
  const h = new Harness({ leaders: [ATTACK_LEADER, DEFENDER_LEADER], deckSize: 20 });
  h.don(0, o.don ?? 0);
  h.don(1, 3);
  if (o.chars?.length) h.field(0, ...o.chars);
  if (o.field?.length) h.field(1, ...o.field);
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

  it("remembers a position it has solved instead of playing it out again (#685)", () => {
    // Two attackers, 2 DON!!, a Blocker and two Counter cards: many orders of the same attacks reach the same boards.
    const state = board({ chars: [BIG, VIVI], don: 2, field: [BLOCKER], hand: [KAROO, KAROO], life: 2 });
    const found = lethalValue(state)!;
    expect(found.steps).toBeLessThan(6000);
    expect(lethalValue(state, 6000)).toMatchObject({ value: found.value });
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

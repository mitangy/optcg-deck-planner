import { listLegalIntents } from "@optcg/rules";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../src/catalog";
import { blockStepOf, defendPuzzle, fewestCards, MAX_COUNTER_CARDS } from "./defend";
import { BIG, board, KAROO, rng, VIVI } from "./testkit";

const catalog = loadCatalog();
const SMALL_BLOCKER = "ST01-006"; // [Blocker], 1000 power
const BIG_BLOCKER = "OP06-043"; // [Blocker], 8000 power
const COUNTER_EVENT_WITH_TARGET = "ST01-014"; // [Counter] +3000 to one Leader or Character: asks which

/** Big Karoo (7000) attacks the Leader of Newgate (6000, 3 Life); the defender's hand and field are what the test sets. */
function leaderAttack(hand: string[], field: string[] = []) {
  const h = board();
  h.field(0, BIG);
  const defenders = field.length ? h.field(1, ...field) : [];
  h.life(1, KAROO, KAROO, KAROO);
  h.hand(1, ...hand);
  const index = listLegalIntents(h.state, 0)
    .filter((i) => i.type === "declare_attack")
    .findIndex((i) => i.type === "declare_attack" && i.attackerId === h.state.players[0].characters[0]!.id && i.target.kind === "leader");
  return { h, defenders, index, blockStep: blockStepOf(h.state, index)! };
}

describe("defend gold comes from every block and every set of Counter cards", () => {
  it("counts a block that saves the Life only when the blocker survives (#685)", () => {
    // 7000 against a 1000 Blocker: the blocker is K.O.'d, so only two 1000 Counters on the Leader (6000 + 2000) save everything.
    const small = leaderAttack([KAROO, KAROO], [SMALL_BLOCKER]);
    expect(small.blockStep).not.toBeNull();
    expect(fewestCards(small.blockStep, 1)).toBe(2);
    // An 8000 Blocker survives 7000: block and use nothing.
    const big = leaderAttack([KAROO, KAROO], [BIG_BLOCKER]);
    expect(fewestCards(big.blockStep, 1)).toBe(0);
  });

  it("is -1 when no block and no Counter cards keep the Life (#685)", () => {
    // One 1000 Counter makes 7000 against 7000, and the attacker wins ties.
    expect(fewestCards(leaderAttack([KAROO]).blockStep, 1)).toBe(-1);
    expect(fewestCards(leaderAttack([]).blockStep, 1)).toBe(-1);
  });

  it("needs the attacked Character to survive, not only the Life (#685)", () => {
    const h = board();
    h.field(0, BIG);
    const [vivi] = h.field(1, VIVI);
    vivi!.rested = true;
    h.hand(1, KAROO, KAROO, KAROO, KAROO);
    const attacks = listLegalIntents(h.state, 0).filter((i) => i.type === "declare_attack");
    const index = attacks.findIndex((i) => i.type === "declare_attack" && i.target.kind === "character" && i.attackerId === h.state.players[0].characters[0]!.id);
    // Life never changes here, but 4000 + 4 x 1000 is needed to beat 7000.
    expect(fewestCards(blockStepOf(h.state, index)!, 1)).toBe(4);
    h.state.players[1].hand.pop();
    expect(fewestCards(blockStepOf(h.state, index)!, 1)).toBe(-1);
  });

  it("counts a Banish hit, which takes the Life with no check to answer (#685)", () => {
    const h = board();
    h.field(0, "OP04-014"); // [Banish], 9000
    h.life(1, KAROO, KAROO, KAROO);
    h.hand(1, KAROO, KAROO, KAROO, KAROO);
    const index = listLegalIntents(h.state, 0).filter((i) => i.type === "declare_attack").findIndex((i) => i.type === "declare_attack" && i.attackerId === h.state.players[0].characters[0]!.id && i.target.kind === "leader");
    // 9000 against 6000: 3000 ties, so four 1000 Counters.
    expect(fewestCards(blockStepOf(h.state, index)!, 1)).toBe(4);
  });

  it("makes no puzzle when the hand holds more Counter cards than the search will try (#685)", () => {
    expect(MAX_COUNTER_CARDS).toBe(6);
    expect(fewestCards(leaderAttack(Array.from({ length: MAX_COUNTER_CARDS }, () => KAROO)).blockStep, 1)).toBe(2);
    expect(fewestCards(leaderAttack(Array.from({ length: MAX_COUNTER_CARDS + 1 }, () => KAROO)).blockStep, 1)).toBeNull();
  });

  it("makes no puzzle when a Counter card asks which card gets the power (#685)", () => {
    const ask = leaderAttack([COUNTER_EVENT_WITH_TARGET, KAROO], [VIVI]);
    ask.h.don(1, 3);
    expect(fewestCards(blockStepOf(ask.h.state, ask.index)!, 1)).toBeNull();
  });
});

describe("the defend puzzle", () => {
  it("asks for the kind of answer it is told to, with the attack and the hand in the text (#685)", () => {
    const h = board();
    h.field(0, BIG);
    h.life(1, KAROO, KAROO, KAROO);
    h.hand(1, KAROO, KAROO);
    const needs = defendPuzzle(h.state, catalog, rng(1), "cards-needed")!;
    expect(needs.type).toBe("defend");
    expect(needs.gold).toEqual({ key: "cards", mode: "number", value: 2 });
    expect(needs.tags).toContain("cards-needed");
    expect(needs.message).toContain("Their Karoo (EB02-001) is attacking your Leader Edward.Newgate (OP02-001)");
    expect(needs.message).toContain("Opponent's Characters: [Karoo (EB02-001), rested, attacking]");
    expect(needs.message).toContain("it is your block step");
    expect(needs.message).toContain("Your hand (2): Karoo (ST01-003); Karoo (ST01-003)");
    expect(needs.message).toContain("Answer -1 if it cannot be done.");
    // Luffy's own 5000 attack on a 6000 Leader fails without any card.
    const none = defendPuzzle(h.state, catalog, rng(1), "no-cards-needed")!;
    expect(none.gold).toEqual({ key: "cards", mode: "number", value: 0 });
    expect(none.tags).toContain("no-cards-needed");
    expect(none.message).toContain("Their Monkey.D.Luffy (ST01-001) is attacking your Leader");
    // No attack in the position can be made to fail for good: the hand is too small for the big one.
    h.state.players[1].hand.pop();
    const impossible = defendPuzzle(h.state, catalog, rng(1), "impossible")!;
    expect(impossible.gold).toEqual({ key: "cards", mode: "number", value: -1 });
    expect(impossible.tags).toContain("impossible");
  });

  it("makes no puzzle when a card it shows is one the engine only half implements (#685)", () => {
    const h = board();
    h.field(0, BIG);
    h.life(1, KAROO, KAROO, KAROO);
    h.hand(1, KAROO, KAROO);
    expect(defendPuzzle(h.state, catalog, rng(1), "cards-needed")).not.toBeNull();
    const partial = [...catalog.cards.values()].find((c) => c.support === "partial" && c.type === "character")!.id;
    h.hand(1, partial);
    expect(defendPuzzle(h.state, catalog, rng(1), "cards-needed")).toBeNull();
  });
});

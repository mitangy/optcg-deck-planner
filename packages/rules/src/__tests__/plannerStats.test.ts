import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CardDataRow } from "../cards/cardData.js";
import type { Ability } from "../effects/types.js";
import { buildPlannerStats, derivePlannerCard, serializePlannerStats } from "../scripts/plannerStats.js";

const row = (over: Partial<CardDataRow> = {}): CardDataRow => ({
  name: "Test",
  type: "character",
  colors: ["red"],
  cost: 3,
  power: 4000,
  traits: ["Straw Hat Crew"],
  attributes: ["Slash"],
  text: "",
  trigger: "",
  source: "bandai",
  sourceUrl: "",
  ...over,
});

const ab = (trigger: Ability["trigger"], extra: Record<string, unknown> = {}): Ability => ({ id: `x#${Math.random()}`, trigger, text: "", ...extra }) as unknown as Ability;
const opp = { ref: "choose", selector: { player: "opponent", zone: "character" }, min: 0, max: 1 };
const mine = { ref: "choose", selector: { player: "you", zone: "character" }, min: 0, max: 1 };

describe("derivePlannerCard", () => {
  it("exports the printed name and any name_alias names", () => {
    const plain = derivePlannerCard(row({ name: "Zoro" }), []);
    expect(plain.n).toBe("Zoro");
    expect(plain.al).toBeUndefined();
    const aliased = derivePlannerCard(row({ name: "Zoro" }), [ab("on_play", { statics: [{ s: "name_alias", names: ["Roronoa Zoro"] }] })]);
    expect(aliased.al).toEqual(["Roronoa Zoro"]);
  });

  it("records a search only when the looked-at card goes to hand", () => {
    const toHand = { do: "look", player: "you", count: 5, picks: [{ min: 0, max: 1, dest: "hand", filter: { traits: ["Straw Hat Crew"], notNames: ["Nami"] } }], rest: "deck_bottom" };
    const toPlay = { do: "look", player: "you", count: 4, picks: [{ min: 0, max: 1, dest: "play", filter: {} }], rest: "deck_bottom" };
    const a = derivePlannerCard(row(), [ab("on_play", { effect: toHand })]);
    expect(a.srch).toEqual([{ look: 5, filter: { traits: ["Straw Hat Crew"], notNames: ["Nami"] } }]);
    expect(a.rl).toEqual(["search"]);
    const b = derivePlannerCard(row(), [ab("on_play", { effect: toPlay })]);
    expect(b.srch).toBeUndefined();
    expect(b.rl).toBeUndefined();
  });

  it("tags removal only for effects aimed at the opponent, through nested effects", () => {
    const ko = (target: unknown) => ({ do: "seq", steps: [{ do: "may", then: { do: "ko", target } }] });
    expect(derivePlannerCard(row(), [ab("on_play", { effect: ko(opp) })]).rl).toEqual(["removal"]);
    expect(derivePlannerCard(row(), [ab("on_play", { effect: ko(mine) })]).rl).toBeUndefined();
    expect(derivePlannerCard(row(), [ab("on_play", { effect: { do: "to_deck", target: opp, position: "bottom" } })]).rl).toEqual(["removal"]);
  });

  it("tags draw, DON!! ramp and life gain for your own side only", () => {
    expect(derivePlannerCard(row(), [ab("on_play", { effect: { do: "draw", player: "you", count: 1 } })]).rl).toEqual(["draw"]);
    expect(derivePlannerCard(row(), [ab("on_play", { effect: { do: "draw", player: "opponent", count: 1 } })]).rl).toBeUndefined();
    expect(derivePlannerCard(row(), [ab("on_play", { effect: { do: "add_don", player: "you", count: 1, rested: false } })]).rl).toEqual(["ramp"]);
    expect(derivePlannerCard(row(), [ab("on_play", { effect: { do: "add_don", player: "opponent", count: 1, rested: false } })]).rl).toBeUndefined();
    expect(derivePlannerCard(row(), [ab("trigger", { effect: { do: "deck_to_life", player: "you", count: 1 } })]).rl).toEqual(["lifeGain"]);
  });

  it("reads self keywords, timing tags, printed Trigger and leader deck rules", () => {
    const c = derivePlannerCard(
      row({ trigger: "[Trigger] Draw 1 card." }),
      [
        ab("static", { statics: [{ s: "keyword", target: "self", keyword: "double_attack" }, { s: "keyword", target: { all: {} }, keyword: "rush" }] }),
        ab("when_attacking", { effect: { do: "nothing" } }),
        ab("on_ko", { effect: { do: "nothing" } }),
      ],
    );
    expect(c.kw).toEqual(["Double Attack"]);
    expect(c.tm).toEqual(["On K.O.", "When Attacking"]);
    expect(c.trg).toBe(1);
    const leader = derivePlannerCard(row({ type: "leader", cost: undefined, life: 5 }), [ab("static", { statics: [{ s: "deck_rule", rule: "max_cost:5" }] })]);
    expect(leader.rules).toEqual(["max_cost:5"]);
    expect(leader.cost).toBeUndefined();
  });

  it("falls back to printed text only for clauses the DSL could not compile", () => {
    const clause = "[On Play] [Blocker] Draw 2 cards. Then, K.O. up to 1 of your opponent's Characters.";
    const c = derivePlannerCard(row(), [], [clause]);
    expect(c.rl).toEqual(["draw", "removal"]);
    expect(c.kw).toEqual(["Blocker"]);
    expect(c.tm).toEqual(["On Play"]);
    expect(derivePlannerCard(row(), [], ["[On Play] K.O. up to 1 of your Characters."]).rl).toBeUndefined();
    // Same words on a fully compiled card are ignored: the DSL is the source of truth.
    const compiled = derivePlannerCard(row({ text: clause }), [ab("on_play", { effect: { do: "nothing" } })]);
    expect(compiled.rl).toBeUndefined();
    expect(compiled.kw).toBeUndefined();
  });
});

describe("leader trait mentions", () => {
  it("lists each {Trait} named in a Leader's text once, and only for Leaders", () => {
    const text = "[Activate: Main] Give up to 1 {Straw Hat Crew} type Character +1000 power. If you have {Supernovas} or {Straw Hat Crew} cards, draw 1.";
    expect(derivePlannerCard(row({ type: "leader", text }), []).lt).toEqual(["Straw Hat Crew", "Supernovas"]);
    expect(derivePlannerCard(row({ type: "leader", text: "No traits here." }), []).lt).toBeUndefined();
    expect(derivePlannerCard(row({ type: "character", text }), []).lt).toBeUndefined();
  });
});

describe("counter data", () => {
  it("exports an event's base [Counter] +power from the [Counter] clause, not [Main] or the conditional extra (#264)", () => {
    const text =
      "[Main] Your Leader gains +5000 power during this turn. [Counter] Up to 1 of your Leader or Character cards gains +2000 power during this battle. Then, if you have 2 or less Life cards, that card gains an additional +3000 power.";
    expect(derivePlannerCard(row({ type: "event", text }), []).ec).toBe(2000);
    const noBoost = "[Counter] Give up to 1 of your opponent's Leader or Character cards −2000 power during this turn.";
    expect(derivePlannerCard(row({ type: "event", text: noBoost }), []).ec).toBeUndefined();
  });

  it("exports a card's own in-hand counter, and counter grants only from Leaders (#264)", () => {
    const self = ab("static", { statics: [{ s: "counter", filter: { onlySelf: true }, mode: "add", value: 2000 }] });
    expect(derivePlannerCard(row({ cost: 10 }), [self]).hc).toBe(2000);
    const grant = ab("static", { statics: [{ s: "counter", filter: { types: ["character"], traits: ["Land of Wano"] }, mode: "set", value: 1000, onlyWithoutCounter: true }] });
    expect(derivePlannerCard(row({ type: "leader", cost: undefined, life: 4 }), [grant]).gc).toEqual([{ v: 1000, t: ["character"], tr: ["Land of Wano"], nc: 1 }]);
    // Kaido OP17-063 grants it only while he is on the field.
    expect(derivePlannerCard(row(), [grant]).gc).toBeUndefined();
  });
});

describe("packages/deck-analytics/deckStats.json", () => {
  it("matches the card data and ability registry (run `npm run export-planner-stats`)", () => {
    const committed = readFileSync(resolve(__dirname, "../../../deck-analytics/deckStats.json"), "utf8");
    expect(committed).toBe(serializePlannerStats(buildPlannerStats()));
  });

});

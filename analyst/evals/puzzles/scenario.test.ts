import { runScenario } from "@optcg/rules/src/testing/scenario";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../src/catalog";
import { asksOf, scenarioPuzzles, usableRow } from "./scenario";
import { SCENARIO_ROWS } from "./scenarioRows";

const catalog = loadCatalog();
const rowNamed = (card: string, fragment: string) => SCENARIO_ROWS.find((r) => r.row.card === card && r.row.name.includes(fragment))!.row;

describe("scenario puzzles", () => {
  it("only use rows the engine runs to the state the row states (#677)", () => {
    const failed: string[] = [];
    for (const { row } of SCENARIO_ROWS) {
      if (!usableRow(row)) continue;
      try {
        runScenario(row);
      } catch (e) {
        failed.push(`${row.card} ${row.name}: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
      }
    }
    expect(failed).toEqual([]);
  });

  it("leave out rows with a step the engine refuses and rows that end in a prompt (#677)", () => {
    expect(usableRow(rowNamed("OP01-031", "cannot activate without"))).toBe(false);
    expect(usableRow(rowNamed("OP01-031", "trashes a Land of Wano card"))).toBe(true);
    expect(usableRow({ card: "X", name: "x", expect: { pending: "select" } })).toBe(false);
  });

  it("take the gold from the seat the question is about (#677)", () => {
    const asks = asksOf(rowNamed("OP01-061", "adds an active DON!! when an opposing Character is K.O.'d"));
    const by = (key: string, seat: number) => asks.find((a) => a.key === key && a.seat === seat)!;
    expect(by("field", 1).gold).toEqual({ key: "field", mode: "multiset", value: [] });
    expect(by("trash", 1).gold).toEqual({ key: "trash", mode: "multiset", value: ["ST01-003"] });
    expect(by("active_don", 0).gold).toEqual({ key: "active_don", mode: "number", value: 1 });
    expect(asks.find((a) => a.key === "field" && a.seat === 0)).toBeUndefined();
  });

  it("ask for the power the row states, for the Character it names (#677)", () => {
    const asks = asksOf(rowNamed("OP01-091", "gives opposing Characters -1000 power with 10 DON!!"));
    expect(asks.filter((a) => a.key.startsWith("power:")).map((a) => [a.key, a.seat, a.gold.value])).toEqual([
      ["power:ST01-003", 1, 2000],
      ["power:ST01-009", 1, 3000],
    ]);
  });

  it("describe the setup and the steps in order, naming each card with its card number (#677)", () => {
    const made = scenarioPuzzles(catalog).find((p) => p.source.includes("OP01-031 trashes a Land of Wano card") && p.gold.key === "hand")!;
    expect(made.gold).toEqual({ key: "hand", mode: "multiset", value: ["ST01-003"] });
    expect(made.question).toBe("After these steps, which cards are in your hand? List a card once for each copy.");
    expect(made.message).toContain("Your hand: Komachiyo (OP01-010); Karoo (ST01-003).");
    expect(made.message).toContain("Your DON!!: 0 active and 3 rested in the cost area.");
    expect(made.message).toContain("Then, in order:\n1. You activate the ability of your Kouzuki Oden (OP01-031)");
    expect(made.message).toContain("Card reference:");
    expect(made.message).toContain("- OP01-031 Kouzuki Oden");
  });

  it("number the steps in the order the row plays them (#677)", () => {
    const made = scenarioPuzzles(catalog).find((p) => p.source.includes("OP18-060 draws 2 and trashes 1") && p.gold.key === "hand")!;
    expect(made.message.match(/^\d\. .*$/gm)).toEqual([
      "1. You play Hamlet (OP08-090) from your hand, paying its cost.",
      "2. When an effect asks for a choice, the choice made is: Speed (OP01-104).",
      "3. When an effect asks for a choice, the choice made is: Karoo (ST01-003).",
    ]);
  });

  it("have a different id each, and a card in every puzzle's reference for each card number it names (#677)", () => {
    const all = scenarioPuzzles(catalog);
    expect(all.length).toBeGreaterThan(60);
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    for (const p of all) for (const id of p.cards) expect(p.message, p.id).toContain(`- ${id} `);
  });
});

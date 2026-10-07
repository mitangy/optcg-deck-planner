import { describe, expect, it } from "vitest";
import { loadCatalog } from "../src/catalog";
import { validateCases } from "./load";
import type { EvalCase } from "./types";

const catalog = loadCatalog();
const c = (id: string, question: string): EvalCase => ({ id, group: "D", question, focus: ["Something."], cites: { all: [] } });

describe("eval case loader", () => {
  it("rejects a case naming a card that isn't in the catalog (#403)", () => {
    const problems = validateCases(catalog, [c("D01", "Is OP99-999 any good?"), c("D02", "Is OP01-001 any good?")], { counts: false });
    expect(problems).toEqual(["D01: OP99-999 is not in the card catalog"]);
  });

  it("rejects two cases with the same id (#403)", () => {
    const problems = validateCases(catalog, [c("D01", "First?"), c("D01", "Second?")], { counts: false });
    expect(problems).toEqual(["D01: duplicate id"]);
  });

  it("rejects a question list with the wrong number of cases per group (#403)", () => {
    expect(validateCases(catalog, [c("D01", "Only one?")])).toContain("group D has 1 cases, expected 10");
  });

  it("rejects an A case whose question hash is not 8 hex characters (#403)", () => {
    const a: EvalCase = { id: "A01", group: "A", question: "Q?", faq: { card: "OP01-091", qh: "not-a-hash" }, verdict: "yes", cites: { all: [] } };
    expect(validateCases(catalog, [a], { counts: false })).toEqual(["A01: qh must be 8 hex characters"]);
  });
});

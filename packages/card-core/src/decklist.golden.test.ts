import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDecklist } from "./decklist.js";

type Case = { name: string; input: string; cards?: [string, number][]; error?: boolean };
const golden = JSON.parse(readFileSync(new URL("../fixtures/decklists.json", import.meta.url), "utf8")) as {
  cases: Case[];
};

// The backend runs the same file in backend/tests/test_decklist_golden.py.
describe("parseDecklist golden cases shared with backend parse_decklist", () => {
  it.each(golden.cases)("$name", ({ input, cards, error }) => {
    if (error) {
      expect(() => parseDecklist(input)).toThrow();
      return;
    }
    expect(parseDecklist(input).map((l) => [l.cardId, l.count])).toEqual(cards);
  });
});

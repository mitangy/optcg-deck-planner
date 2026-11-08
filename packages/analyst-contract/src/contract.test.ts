import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHAT_MODEL_IDS, LIMIT_CODES, REFUSAL_CODES, SCOPE_PATTERN, SCOPE_PATTERN_SOURCE } from "./index";

/** The values the API keeps; backend/tests/test_analyst_contract.py asserts the Python side against the same file. */
const backend = JSON.parse(readFileSync(new URL("../fixtures/backend-values.json", import.meta.url), "utf8")) as {
  scopePattern: string;
  chatModels: string[];
  budgetRefusals: string[];
  usageRefusals: string[];
};

describe("the Log Pose contract matches the API's values (refactor 2.5)", () => {
  it("uses the scope pattern text the API validates with", () => {
    expect(SCOPE_PATTERN_SOURCE).toBe(backend.scopePattern);
  });
  it("offers the same models, in the same order, as the API's allow-list", () => {
    expect([...CHAT_MODEL_IDS]).toEqual(backend.chatModels);
  });
  it("names the same refusals as the API's budget answer", () => {
    expect([...REFUSAL_CODES]).toEqual(backend.budgetRefusals);
  });
  it("names the same limits as the API's refused usage row", () => {
    expect([...LIMIT_CODES]).toEqual(backend.usageRefusals);
  });
  it("takes the scopes of a page, a match and a deck and refuses anything else", () => {
    for (const ok of ["general", "match:m_1-a", "deck:planner:42", "deck:duel:d-9"]) expect(SCOPE_PATTERN.test(ok)).toBe(true);
    for (const bad of ["", "match:", "deck:planner:abc", "deck:planner:1234567890123", "general\n", "deck:other:1"]) expect(SCOPE_PATTERN.test(bad)).toBe(false);
  });
});

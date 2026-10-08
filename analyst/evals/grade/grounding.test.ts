import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../src/catalog";
import { grounded } from "./grounding";

const catalog = loadCatalog();
const user = "Is OP01-001 fine? Here is my deck.";

describe("grounding", () => {
  it("flags a percentage no tool returned (#403)", () => {
    const r = grounded("Sabo wins about 60% of the time.", { tools: "Overall: 56.1% win rate, 23 wins in 41 games.", user }, { catalog });
    expect(r.ok).toBe(false);
    expect(r.ungrounded).toEqual(["60%"]);
  });

  it("accepts a tool's 78.0% written as 78% (#403)", () => {
    const tools = "By turn 3: 78% to have seen at least 1. By turn 1: 35.3% to have seen at least 1.";
    expect(grounded("You see it 78% of the time by turn 3.", { tools, user }, { catalog }).ok).toBe(true);
    expect(grounded("35.3% in the opening hand.", { tools, user }, { catalog }).ok).toBe(true);
    // Half a point either way of a whole number the tool printed; not more.
    expect(grounded("78.4% by turn 3.", { tools, user }, { catalog }).ok).toBe(true);
    expect(grounded("79% by turn 3.", { tools, user }, { catalog }).ok).toBe(false);
  });

  it("accepts a whole-number rounding of a tool's percentage but not a number it never returned (#414)", () => {
    const tools = "By turn 1: 35.3% to have seen at least 1. By turn 3: 91.2%, and 86.7% on turn 1.";
    expect(grounded("About 35% in the opening hand.", { tools, user }, { catalog }).ok).toBe(true);
    expect(grounded("You have 91% by turn 3, 87% on turn 1.", { tools, user }, { catalog }).ok).toBe(true);
    expect(grounded("About 36% in the opening hand.", { tools, user }, { catalog }).ungrounded).toEqual(["36%"]);
    expect(grounded("About 90% by turn 3.", { tools, user }, { catalog }).ungrounded).toEqual(["90%"]);
    expect(grounded("35.6% in the opening hand.", { tools, user }, { catalog }).ungrounded).toEqual(["35.6%"]);
    expect(grounded("35.9% in the opening hand.", { tools, user }, { catalog }).ungrounded).toEqual(["35.9%"]);
  });

  it("flags a card number the tools never returned (#403)", () => {
    const tools = "OP01-004 Usopp: character, red, cost 2.";
    expect(grounded("Play OP01-004 first.", { tools, user }, { catalog }).ok).toBe(true);
    const r = grounded("Play OP01-004, then OP01-016.", { tools, user }, { catalog });
    expect(r.ungrounded).toEqual(["OP01-016"]);
    // A made-up number is flagged even when something quoted it.
    expect(grounded("Try OP99-999.", { tools: `${tools} OP99-999`, user }, { catalog }).ungrounded).toEqual(["OP99-999"]);
  });

  it("flags a win count the tools never returned (#403)", () => {
    const r = grounded("It went 30 wins in 41 games.", { tools: "23 wins in 41 games", user }, { catalog });
    expect(r.ungrounded).toEqual(["30 wins"]);
  });

  it("counts the player's own message as a source (#403)", () => {
    expect(grounded("Your OP01-001 leader is fine.", { tools: "", user }, { catalog }).ok).toBe(true);
    // A deck pasted as "4xOP01-001" counts too.
    expect(grounded("Cut OP01-004.", { tools: "", user: "Deck:\n1xOP01-001\n4xOP01-004" }, { catalog }).ok).toBe(true);
    expect(grounded("You said 12% earlier.", { tools: "", user: "I win 12% of games" }, { catalog }).ok).toBe(true);
  });
});

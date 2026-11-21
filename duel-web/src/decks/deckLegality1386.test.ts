import { describe, expect, it } from "vitest";
import { deckSubtitle, offColourCount, sharesColour } from "./deckLegality";

const RED = "ST01-006"; // red character
const GREEN = "EB01-012"; // green character
const LEADER = "ST01-001"; // red leader

describe("deck legality wording (#1386)", () => {
  it("a card is legal when any one of its colours is a Leader colour (#1386)", () => {
    expect(sharesColour(["red"], ["red", "green"])).toBe(true);
    expect(sharesColour(["red", "green"], ["green"])).toBe(true);
    expect(sharesColour(["red"], ["green", "blue"])).toBe(false);
  });

  it("subtitle says Ready to play at exactly 50 legal cards (#1386)", () => {
    expect(deckSubtitle(LEADER, Array(50).fill(RED))).toMatch(/ · Ready to play$/);
  });

  it("subtitle counts how many cards short or over, in the singular too (#1386)", () => {
    expect(deckSubtitle(LEADER, Array(47).fill(RED))).toMatch(/ · 3 cards short$/);
    expect(deckSubtitle(LEADER, Array(49).fill(RED))).toMatch(/ · 1 card short$/);
    expect(deckSubtitle(LEADER, Array(52).fill(RED))).toMatch(/ · 2 cards over$/);
  });

  it("off-colour cards are counted by copy and block Ready to play (#1386)", () => {
    const cards = [...Array(48).fill(RED), GREEN, GREEN];
    expect(offColourCount(LEADER, cards)).toBe(2);
    const text = deckSubtitle(LEADER, cards);
    expect(text).toMatch(/ · 50 cards · 2 off-colour cards$/);
    expect(text).not.toContain("Ready to play");
    expect(deckSubtitle(LEADER, [...Array(49).fill(RED), GREEN])).toMatch(/ · 1 off-colour card$/);
  });
});

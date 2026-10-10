import { describe, expect, it } from "vitest";
import { shortHash } from "../src/sources";
import { polarity, resolveCardRuling } from "./faq";

// Synthetic rows: made-up questions, never Bandai's.
const rows = [
  { question: "synthetic question one?", answer: "No, you cannot." },
  { question: "synthetic question two?", answer: "Yes." },
  { question: "synthetic question three?", answer: "Yes, if it is your turn." },
];

describe("FAQ references", () => {
  it("resolves a FAQ reference to the 1-based ruling id card_rulings shows (#403)", () => {
    expect(resolveCardRuling(rows, "OP01-001", shortHash("synthetic question two?"))).toEqual({ source: "ruling:OP01-001#2", polarity: "yes" });
  });

  it("marks a reference whose question is gone as stale, not as a No (#403)", () => {
    expect(resolveCardRuling(rows, "OP01-001", shortHash("a question Bandai removed?"))).toBe("stale");
  });

  it("reads the verdict from the official answer's first word (#403)", () => {
    expect(polarity("No, you cannot.")).toBe("no");
    expect(polarity("Yes.")).toBe("yes");
    expect(polarity("Not if the effect was already used.")).toBe("other");
  });
});

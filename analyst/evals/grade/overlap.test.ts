import { describe, expect, it } from "vitest";
import { officialOverlap, shareable } from "./overlap";

// Synthetic "official" text.
const official = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar";

describe("official text guard", () => {
  it("refuses to store an answer that repeats 12 words of official text (#403)", () => {
    const twelve = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima";
    expect(officialOverlap(`Well, ${twelve}, and so on.`, official)).toBe(12);
    expect(shareable(`Well, ${twelve}, and so on.`, official)).toBe(false);
  });

  it("stores an answer that shares only 11 words, or scattered words (#403)", () => {
    const eleven = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo";
    expect(shareable(`Well, ${eleven} then oscar.`, official)).toBe(true);
    expect(shareable("alpha then bravo then charlie then delta", official)).toBe(true);
  });
});

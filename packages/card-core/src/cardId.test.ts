import { describe, expect, it } from "vitest";
import { isCardId, normalizeCardId } from "./cardId.js";

describe("normalizeCardId", () => {
  it("maps parallel and reprint printing ids to the base card, ignoring case and spaces", () => {
    expect(normalizeCardId(" op01-016_p2 ")).toBe("OP01-016");
    expect(normalizeCardId("ST01-001_R1")).toBe("ST01-001");
    expect(normalizeCardId("OP01-016_P12")).toBe("OP01-016");
  });

  it("keeps a plain card number and only drops a trailing art suffix", () => {
    expect(normalizeCardId("OP01-016")).toBe("OP01-016");
    expect(normalizeCardId("P-001")).toBe("P-001");
    expect(normalizeCardId("OP01_P1-016")).toBe("OP01_P1-016");
  });
});

describe("isCardId", () => {
  it("accepts printed card numbers whatever their case", () => {
    expect(isCardId("OP16-080")).toBe(true);
    expect(isCardId(" st01-001 ")).toBe(true);
    expect(isCardId("P-001")).toBe(true);
  });

  it("rejects text that is not a card number", () => {
    expect(isCardId("hello")).toBe(false);
    expect(isCardId("OP01")).toBe(false);
    expect(isCardId("OP01-001_p1")).toBe(false);
  });
});

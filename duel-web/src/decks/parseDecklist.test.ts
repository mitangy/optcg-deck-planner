import { describe, expect, it } from "vitest";
import { expandDecklist, parseDecklist, toDecklistText } from "./parseDecklist";
import { validateImportedList } from "./storage";

describe("parseDecklist", () => {
  it("parses OPTCGSim and egman styles", () => {
    const a = parseDecklist("1xST01-001\n4xST01-003\n4x ST01-006 TonyTony.Chopper");
    expect(a).toEqual(
      expect.arrayContaining([
        { cardId: "ST01-001", count: 1 },
        { cardId: "ST01-003", count: 4 },
        { cardId: "ST01-006", count: 4 },
      ]),
    );
    const b = parseDecklist("4 ST01-008 Nico Robin\nST01-014 x4");
    expect(expandDecklist(b).filter((id) => id === "ST01-008")).toHaveLength(4);
    expect(expandDecklist(b).filter((id) => id === "ST01-014")).toHaveLength(4);
  });

  it("round-trips toDecklistText", () => {
    const text = toDecklistText(["ST01-003", "ST01-003"], "ST01-001");
    expect(text).toContain("1xST01-001");
    expect(text).toContain("2xST01-003");
  });
});

describe("validateImportedList", () => {
  it("accepts curated ST01 list with leader", () => {
    const v = validateImportedList(`1xST01-001
4xST01-003
4xST01-006
4xST01-008
4xST01-009
4xST01-014`);
    expect(v.ok).toBe(true);
    expect(v.leaderId).toBe("ST01-001");
    expect(v.cards).toHaveLength(20);
  });

  it("rejects unknown and over-4", () => {
    const v = validateImportedList("1xST01-001\n5xST01-003\n1xOP99-999");
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => /max 4/i.test(e))).toBe(true);
    expect(v.errors.some((e) => /OP99-999/.test(e))).toBe(true);
  });
});

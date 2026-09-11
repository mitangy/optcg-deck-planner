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

  it("rejects over-4 but allows uncurated OPTCG ids as stubs", () => {
    const v = validateImportedList("1xST01-001\n5xST01-003\n1xOP99-999");
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => /max 4|copies/i.test(e))).toBe(true);
    expect(v.errors.some((e) => /OP99-999/.test(e))).toBe(false);
    expect(v.warnings.some((w) => /OP99-999/.test(w))).toBe(true);
  });

  it("accepts Test OP16 black seed list including OP16-080", () => {
    const v = validateImportedList(`1xOP16-080
4xEB04-058
3xOP09-086
4xOP09-093
2xOP09-095
2xOP09-096
4xOP09-099
4xOP12-112
2xOP14-108
4xOP16-104
2xOP16-106
4xOP16-108
4xOP16-109
4xOP16-110
1xOP16-115
2xOP16-116
4xOP16-119`);
    expect(v.ok).toBe(true);
    expect(v.leaderId).toBe("OP16-080");
    expect(v.cards.length).toBeGreaterThanOrEqual(40);
  });
});

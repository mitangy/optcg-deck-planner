import { describe, expect, it } from "vitest";
import {
  buildOptcgSimExport,
  optcgSimFilename,
} from "./optcgsimExport";

describe("buildOptcgSimExport", () => {
  it("formats qty×id lines with leader first", () => {
    const result = buildOptcgSimExport(
      [
        { card_id: "op15-053", needed: 4, card_type: "Character" },
        { card_id: "OP15-002", needed: 1, card_type: "Leader" },
        { card_id: "OP15-052", needed: 4, card_type: "Character" },
      ],
      { leaderCardId: "OP15-002" },
    );
    expect(result.pasteText).toBe("1xOP15-002\n4xOP15-052\n4xOP15-053");
    expect(result.lineCount).toBe(3);
    expect(result.copyCount).toBe(9);
  });

  it("omits DON!! and zero-qty lines", () => {
    const result = buildOptcgSimExport([
      { card_id: "OP01-016", needed: 4, card_type: "Character" },
      { card_id: "DON-123", needed: 10, card_type: "DON!!", section: "don" },
      { card_id: "OP01-025", needed: 0, card_type: "Character" },
      { card_id: "OP09-001", needed: 2, card_type: "DON!! Card" },
    ]);
    expect(result.pasteText).toBe("4xOP01-016");
    expect(result.copyCount).toBe(4);
  });

  it("returns empty paste when nothing exportable", () => {
    const result = buildOptcgSimExport([
      { card_id: "DON-1", needed: 10, section: "don" },
    ]);
    expect(result.pasteText).toBe("");
    expect(result.lineCount).toBe(0);
  });
});

describe("optcgSimFilename", () => {
  it("sanitizes and appends .txt", () => {
    expect(optcgSimFilename("  Purple Luffy / V1  ")).toBe("Purple Luffy V1.txt");
    expect(optcgSimFilename("deck.deck")).toBe("deck.deck");
    expect(optcgSimFilename("")).toBe("deck.txt");
  });
});

import { describe, expect, it } from "vitest";
import {
  extractCardIdTokens,
  nameOverlapScore,
  normalizeScanText,
  repairCardId,
  resolveScannedCardId,
  voteScannedCardId,
} from "./cardScan";

/** A stand-in for the catalog id set the scanner is constrained against. */
const KNOWN = new Set([
  "OP15-053",
  "OP15-052",
  "OP01-016",
  "OP05-065",
  "ST03-008",
  "ST30-009",
  "EB04-007",
  "PRB01-001",
  "P-001",
]);

describe("normalizeScanText", () => {
  it("collapses unicode dashes and spacing around the separator", () => {
    expect(normalizeScanText("op15 – 053")).toBe("OP15-053");
    expect(normalizeScanText("OP15 — 053")).toBe("OP15-053");
    expect(normalizeScanText("OP15 - 053")).toBe("OP15-053");
  });

  it("drops punctuation the card face picks up", () => {
    expect(normalizeScanText("©BANDAI  OP15-053.")).toBe("BANDAI OP15-053");
  });
});

describe("repairCardId", () => {
  it("accepts a clean read unchanged", () => {
    expect(repairCardId("OP15-053")).toBe("OP15-053");
    expect(repairCardId("PRB01-001")).toBe("PRB01-001");
    expect(repairCardId("P-001")).toBe("P-001");
  });

  it("fixes digit-for-letter misreads in the prefix", () => {
    expect(repairCardId("0P15-053")).toBe("OP15-053");
    expect(repairCardId("5T03-008")).toBe("ST03-008");
    expect(repairCardId("E804-007")).toBe("EB04-007");
  });

  it("fixes letter-for-digit misreads in the numbers", () => {
    expect(repairCardId("OPI5-O53")).toBe("OP15-053");
    expect(repairCardId("OP15-0S3")).toBe("OP15-053");
    expect(repairCardId("OP15-B53")).toBe("OP15-853");
  });

  it("snaps a misread prefix onto the closed set of real prefixes", () => {
    // Tesseract reads the P of OP as a lowercase r on foil/parallel cards.
    expect(repairCardId("OR11-070")).toBe("OP11-070");
    expect(repairCardId("5T03-008")).toBe("ST03-008");
  });

  it("refuses a prefix that is not uniquely near a real one", () => {
    expect(repairCardId("XY11-070")).toBeNull();
  });

  it("rejects tokens that cannot be card ids", () => {
    // DON!! catalog ids are synthetic and never printed on the card.
    expect(repairCardId("DON-434340")).toBeNull();
    expect(repairCardId("XY15-053")).toBeNull();
    expect(repairCardId("OP15-05")).toBeNull();
    expect(repairCardId("OP15")).toBeNull();
  });
});

describe("extractCardIdTokens", () => {
  it("finds the id inside surrounding card text", () => {
    const raw = "Trafalgar Law  ST03-008  ©BANDAI";
    expect(extractCardIdTokens(raw)).toEqual(["ST03-008"]);
  });

  it("returns every candidate in reading order", () => {
    expect(extractCardIdTokens("OP15-053 and OP15-052")).toEqual([
      "OP15-053",
      "OP15-052",
    ]);
  });

  it("reads a number with the rarity badge flush against it", () => {
    // Real Tesseract output from an SR parallel: the rarity and cost glyphs
    // run straight into the collector number with no separator, and come back
    // as letters or digits depending on the crop.
    expect(extractCardIdTokens("Big Mom Pirates or11-070E3 © B")).toEqual(["OR11-070"]);
    expect(extractCardIdTokens("Big Mom Pirates oP11-07063 © S")).toEqual(["OP11-070"]);
    expect(extractCardIdTokens("OP11-070SR")).toEqual(["OP11-070"]);
  });

  it("takes exactly three characters as the collector number", () => {
    // Trailing digits are badge noise, never part of the number.
    expect(extractCardIdTokens("OP11-0701")).toEqual(["OP11-070"]);
  });

  it("still rejects a number-shaped token with no valid prefix", () => {
    expect(extractCardIdTokens("2024-1234").map(repairCardId)).toEqual([null]);
  });
});

describe("real card reads", () => {
  const IDS = new Set(["OP11-070"]);
  const NAMES = new Map([["OP11-070", "Charlotte Pudding"]]);

  // Both are verbatim Tesseract output from the same physical card, captured
  // from different crops. The rarity badge resolved to letters in one and
  // digits in the other, which is why neither may constrain what follows.
  it.each([
    ["badge as letters", "Big Mom Pirates or11-070E3 © B"],
    ["badge as digits", "CHARACTER\nCharlotte Pudding 4\nBig Mom Pirates oP11-07063 © S"],
  ])("resolves the Charlotte Pudding SR parallel — %s", (_label, raw) => {
    expect(resolveScannedCardId(raw, IDS, NAMES)?.card_id).toBe("OP11-070");
  });
});

describe("resolveScannedCardId", () => {
  it("prefers an untouched read and reports it as exact", () => {
    expect(resolveScannedCardId("OP15-053", KNOWN)).toEqual({
      card_id: "OP15-053",
      confidence: "exact",
      source: "OP15-053",
    });
  });

  it("repairs a misread and confirms it against the catalog", () => {
    expect(resolveScannedCardId("0P15-O53", KNOWN)).toEqual({
      card_id: "OP15-053",
      confidence: "repaired",
      source: "0P15-O53",
    });
  });

  it("prefers a candidate that exists over one that only looks valid", () => {
    // OP99-999 is well-formed but not a real card; the real id wins.
    const match = resolveScannedCardId("OP99-999 OP01-016", KNOWN);
    expect(match?.card_id).toBe("OP01-016");
  });

  it("recovers a single wrong digit when exactly one real card is near", () => {
    // OP01-017 does not exist; OP01-016 is the only real card one digit away.
    const match = resolveScannedCardId("OP01-017", KNOWN);
    expect(match).toEqual({
      card_id: "OP01-016",
      confidence: "fuzzy",
      source: "OP01-017",
    });
  });

  it("refuses to guess when a misread is ambiguous", () => {
    // OP15-051 sits one substitution from both OP15-052 and OP15-053.
    expect(resolveScannedCardId("OP15-051", KNOWN)).toBeNull();
  });

  it("returns null when nothing card-shaped is present", () => {
    expect(resolveScannedCardId("Straw Hat Crew", KNOWN)).toBeNull();
    expect(resolveScannedCardId("", KNOWN)).toBeNull();
  });

  it("falls back to shape validation without a catalog", () => {
    const match = resolveScannedCardId("OP99-999");
    expect(match?.card_id).toBe("OP99-999");
    expect(match?.confidence).toBe("exact");
  });
});

describe("nameOverlapScore", () => {
  it("scores a name present in the read", () => {
    expect(nameOverlapScore("Otama", "Otama OP01-006 ©BANDAI")).toBe(1);
    expect(nameOverlapScore("Otama", "Uta OP01-008")).toBe(0);
  });

  it("ignores short and stopword tokens", () => {
    // "D" and "the" carry no evidence; "Monkey"/"Luffy" do.
    expect(nameOverlapScore("Monkey.D.Luffy", "MONKEY LUFFY P-001")).toBe(1);
  });
});

describe("resolveScannedCardId with a name cross-check", () => {
  const NAMES = new Map([
    ["OP01-016", "Nami"],
    ["OP01-018", "Nico Robin"],
    ["OP15-053", "Otama"],
    ["OP15-052", "Uta"],
  ]);
  const IDS = new Set(NAMES.keys());

  it("keeps the read when the printed name agrees", () => {
    const match = resolveScannedCardId("Otama OP15-053", IDS, NAMES);
    expect(match?.card_id).toBe("OP15-053");
    expect(match?.confidence).toBe("exact");
  });

  it("overrides a valid-but-wrong id when the name points elsewhere", () => {
    // A misread digit landed on OP15-052, which is a real card — but the
    // printed name says Otama, so OP15-053 is the right answer.
    const match = resolveScannedCardId("Otama OP15-052", IDS, NAMES);
    expect(match?.card_id).toBe("OP15-053");
    expect(match?.confidence).toBe("fuzzy");
  });

  it("keeps the read when no neighbour's name matches either", () => {
    const match = resolveScannedCardId("Zoro OP15-052", IDS, NAMES);
    expect(match?.card_id).toBe("OP15-052");
  });
});

describe("voteScannedCardId", () => {
  it("picks the id most frames agree on", () => {
    const vote = voteScannedCardId([
      { card_id: "OP15-053", confidence: "repaired", source: "0P15-053" },
      { card_id: "OP15-052", confidence: "repaired", source: "OP15-052" },
      { card_id: "OP15-053", confidence: "repaired", source: "OP15-053" },
      null,
      { card_id: "OP15-053", confidence: "exact", source: "OP15-053" },
    ]);
    expect(vote).toEqual({ card_id: "OP15-053", count: 3, confidence: "exact" });
  });

  it("breaks ties on the stronger confidence", () => {
    const vote = voteScannedCardId([
      { card_id: "OP15-052", confidence: "fuzzy", source: "OP15-05Z" },
      { card_id: "OP15-053", confidence: "exact", source: "OP15-053" },
    ]);
    expect(vote?.card_id).toBe("OP15-053");
  });

  it("returns null when no frame resolved", () => {
    expect(voteScannedCardId([null, null])).toBeNull();
  });
});

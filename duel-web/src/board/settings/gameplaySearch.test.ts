import { describe, expect, it } from "vitest";
import {
  GAMEPLAY_GROUPS,
  filterGroupsByQuery,
  hiddenRowsNote,
  searchWords,
  type FieldDevice,
  type RowKey,
} from "./gameplayFields";
import { ROW_TEXT, rowSearchText } from "./gameplayText";

const desktop: FieldDevice = { desktop: true, tiltFits: true, finePointer: true, portrait: false };
const phone: FieldDevice = { desktop: false, tiltFits: false, finePointer: false, portrait: true };

const rowsFor = (q: string): RowKey[] => filterGroupsByQuery(GAMEPLAY_GROUPS, q, rowSearchText).flatMap((g) => g.rows);

describe("Settings search over Gameplay rows (#1389)", () => {
  it("every row in a group has its label and hint in the text map the search reads (#1389)", () => {
    for (const row of GAMEPLAY_GROUPS.flatMap((g) => g.rows)) {
      expect(ROW_TEXT[row], row).toBeDefined();
      expect(ROW_TEXT[row].label.length, row).toBeGreaterThan(0);
      expect(ROW_TEXT[row].hint.length, row).toBeGreaterThan(0);
    }
  });

  it("a blank or spaces-only search keeps every group as it is (#1389)", () => {
    expect(filterGroupsByQuery(GAMEPLAY_GROUPS, "", rowSearchText)).toEqual(GAMEPLAY_GROUPS);
    expect(filterGroupsByQuery(GAMEPLAY_GROUPS, "   ", rowSearchText)).toEqual(GAMEPLAY_GROUPS);
    expect(searchWords("  Foo   bar ")).toEqual(["foo", "bar"]);
  });

  it("finds a row by its label, in any case (#1389)", () => {
    expect(rowsFor("BATTLE")).toEqual(["battleArrow"]);
  });

  it("finds a row by words that are only in its hint (#1389)", () => {
    // "grips" is in Drag handles' hint, not in any label.
    expect(rowsFor("grips")).toEqual(["layoutGrips"]);
  });

  it("needs every word of a multi-word search, in any order (#1389)", () => {
    expect(rowsFor("glow attack")).toEqual(["attackGlow"]);
    expect(rowsFor("arrow glow")).toEqual([]);
  });

  it("a group title keeps all of its rows, and groups with no match are dropped in their original order (#1389)", () => {
    const groups = filterGroupsByQuery(GAMEPLAY_GROUPS, "animations", rowSearchText);
    expect(groups.map((g) => g.id)).toEqual(["motion"]);
    expect(groups[0]!.rows).toEqual(["animationSpeed", "cardSpotlight", "reduceMotion"]);
    expect(filterGroupsByQuery(GAMEPLAY_GROUPS, "sound", rowSearchText).map((g) => g.id)).toEqual(["sound", "spectating"]);
  });

  it("a search nothing matches leaves no groups (#1389)", () => {
    expect(filterGroupsByQuery(GAMEPLAY_GROUPS, "zzzxq", rowSearchText)).toEqual([]);
  });
});

describe("Gameplay device note (#1389)", () => {
  it("tells a computer that some options are phone-only, and a phone that some are computer-only (#1389)", () => {
    expect(hiddenRowsNote(desktop)).toBe("Some options only show on a phone or tablet.");
    expect(hiddenRowsNote(phone)).toBe("Some options only show on a computer.");
  });
});

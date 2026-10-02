import { describe, expect, it } from "vitest";
import type { ChoiceOptionView } from "../net/protocol";
import { allOptionsOnField, pickCaption, resolvesOnPick, toggleSelection } from "./fieldTargets";

const board = new Set(["c1", "c2", "L1"]);
const opt = (id: string, extra: Partial<ChoiceOptionView> = {}): ChoiceOptionView =>
  ({ id, defId: "ST01-003", zone: "character", ownerSeat: 0, instanceId: id, eligible: true, ...extra }) as ChoiceOptionView;

describe("field target choices", () => {
  it("are picked on the board when every eligible option is a field card (#254)", () => {
    expect(allOptionsOnField([opt("c1"), opt("L1", { zone: "leader" })], board)).toBe(true);
  });

  it("keep the pop-up when an eligible option is off the field (#254)", () => {
    expect(allOptionsOnField([opt("c1"), opt("h1", { zone: "hand" })], board)).toBe(false);
    expect(allOptionsOnField([opt("c1"), opt("c9")], board)).toBe(false);
  });

  it("keep the pop-up for DON!! options even when they carry an instance id (#254)", () => {
    expect(allOptionsOnField([opt("c1", { zone: "don" })], board)).toBe(false);
  });

  it("ignore ineligible off-field options but never pick an empty set (#254)", () => {
    expect(allOptionsOnField([opt("c1"), opt("h1", { zone: "hand", eligible: false })], board)).toBe(true);
    expect(allOptionsOnField([opt("c1", { eligible: false })], board)).toBe(false);
  });
});

describe("pick helpers", () => {
  it("a single pick swaps and a second tap clears it (#254)", () => {
    expect(toggleSelection(["a"], "b", 1)).toEqual(["b"]);
    expect(toggleSelection(["a"], "a", 1)).toEqual([]);
  });

  it("stops adding at the maximum (#254)", () => {
    expect(toggleSelection(["a", "b"], "c", 2)).toEqual(["a", "b"]);
    expect(toggleSelection(["a"], "b", 2)).toEqual(["a", "b"]);
  });

  it("one-tap answers only for exactly one required pick (#254)", () => {
    expect(resolvesOnPick(true, 1, 1)).toBe(true);
    expect(resolvesOnPick(false, 1, 1)).toBe(false);
    expect(resolvesOnPick(true, 0, 1)).toBe(false);
    expect(resolvesOnPick(true, 1, 2)).toBe(false);
  });

  it("captions the range and the running count (#254)", () => {
    expect(pickCaption(1, 1, 0)).toBe("Choose 1");
    expect(pickCaption(0, 2, 1)).toBe("Choose up to 2 · selected 1");
    expect(pickCaption(1, 3, 2)).toBe("Choose 1–3 · selected 2");
  });
});

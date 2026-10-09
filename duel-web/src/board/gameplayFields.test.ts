import { describe, expect, it } from "vitest";
import { showOrientation, toggleShown, turnAlertCopy, type FieldDevice } from "./gameplayFields";

const desktop: FieldDevice = { desktop: true, tiltFits: true, finePointer: true };
const phone: FieldDevice = { desktop: false, tiltFits: false, finePointer: false };

describe("gameplay rows by device", () => {
  it("hides the screen orientation lock with a mouse and shows it on a phone (#281)", () => {
    expect(showOrientation(desktop)).toBe(false);
    expect(showOrientation(phone)).toBe(true);
  });

  it("words the turn-alert switch as Tab alert with a mouse and keeps Vibration on a phone (#281)", () => {
    const vibration = { label: "Vibration", hint: "Short buzzes on supported phones." };
    expect(turnAlertCopy(phone, vibration)).toEqual(vibration);
    const onDesktop = turnAlertCopy(desktop, vibration);
    expect(onDesktop.label).toBe("Tab alert");
    expect(onDesktop.hint).not.toMatch(/phone|buzz/i);
  });

  it("lists Tilted board only where it can show and Drag handles only on a desktop window (#281)", () => {
    expect(toggleShown("tiltedBoard", desktop)).toBe(true);
    expect(toggleShown("tiltedBoard", phone)).toBe(false);
    expect(toggleShown("layoutGrips", desktop)).toBe(true);
    expect(toggleShown("layoutGrips", { ...desktop, desktop: false })).toBe(false);
    expect(toggleShown("turnSound", phone)).toBe(true);
  });

  it("lists Simple board only on phones and tablets, not a desktop window (#445)", () => {
    expect(toggleShown("compactOwnBoard", phone)).toBe(true);
    expect(toggleShown("compactOwnBoard", desktop)).toBe(false);
  });
});

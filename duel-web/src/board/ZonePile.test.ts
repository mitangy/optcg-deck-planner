import { describe, expect, it } from "vitest";
import { lifePileFaceCount, stackPileFaceCount, zonePileCountLabel } from "./ZonePile";

describe("zonePileCountLabel", () => {
  it("shows actual life count instead of question marks", () => {
    expect(zonePileCountLabel(4, 5)).toBe("4");
  });

  it("shows expected leader life before life cards are dealt", () => {
    expect(zonePileCountLabel(0, 5)).toBe("0 / 5");
  });

  it("shows zero when no expected count", () => {
    expect(zonePileCountLabel(0)).toBe("0");
  });
});

describe("lifePileFaceCount", () => {
  it("renders one face per life card", () => {
    expect(lifePileFaceCount(1)).toBe(1);
    expect(lifePileFaceCount(4)).toBe(4);
    expect(lifePileFaceCount(5)).toBe(5);
  });

  it("caps the vertical fan at 5 faces", () => {
    expect(lifePileFaceCount(6)).toBe(5);
    expect(lifePileFaceCount(99)).toBe(5);
  });

  it("shows no faces when life is empty", () => {
    expect(lifePileFaceCount(0)).toBe(0);
    expect(lifePileFaceCount(-1)).toBe(0);
  });
});

describe("stackPileFaceCount", () => {
  it("draws no faces for an empty deck / DON!! deck / trash", () => {
    expect(stackPileFaceCount(0)).toBe(0);
    expect(stackPileFaceCount(-3)).toBe(0);
  });

  it("draws one face per card up to a 3-deep stack", () => {
    expect(stackPileFaceCount(1)).toBe(1);
    expect(stackPileFaceCount(2)).toBe(2);
    expect(stackPileFaceCount(3)).toBe(3);
    expect(stackPileFaceCount(40)).toBe(3);
  });
});

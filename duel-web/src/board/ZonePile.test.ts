import { describe, expect, it } from "vitest";
import { zonePileCountLabel } from "./ZonePile";

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

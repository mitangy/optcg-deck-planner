import { describe, expect, it } from "vitest";
import { needsUsername, usernameFormatError } from "./username";

describe("usernameFormatError", () => {
  it("accepts valid handles (trimmed)", () => {
    for (const ok of ["abc", "Straw_Hat-99", "A".repeat(20), "  Zoro  ", "Miko.T"]) {
      expect(usernameFormatError(ok)).toBeNull();
    }
  });

  it("rejects bad length", () => {
    expect(usernameFormatError("ab")).toMatch(/3–20/);
    expect(usernameFormatError("x".repeat(21))).toMatch(/3–20/);
    expect(usernameFormatError("   ")).toMatch(/3–20/);
  });

  it("rejects disallowed characters", () => {
    for (const bad of ["has space", "ñandú", "emoji😀x", ".Miko", "Miko.", "Mi..ko"]) {
      expect(usernameFormatError(bad)).toMatch(/letters, numbers/);
    }
  });
});

describe("needsUsername", () => {
  it("only prompts signed-in users without a username", () => {
    expect(needsUsername(null)).toBe(false);
    expect(needsUsername({ username: null })).toBe(true);
    expect(needsUsername({})).toBe(true);
    expect(needsUsername({ username: "Luffy" })).toBe(false);
  });
});

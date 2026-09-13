import { describe, expect, it } from "vitest";
import { BUILD_SHA, formatBuildTag } from "./buildInfo";

describe("formatBuildTag", () => {
  it("uses the first 7 characters of a full SHA", () => {
    expect(formatBuildTag("ece6829abc123")).toBe("ece6829");
  });

  it("keeps an already-short SHA", () => {
    expect(formatBuildTag("abc1234")).toBe("abc1234");
  });

  it("falls back to dev when missing", () => {
    expect(formatBuildTag(undefined)).toBe("dev");
    expect(formatBuildTag("")).toBe("dev");
    expect(formatBuildTag("   ")).toBe("dev");
  });
});

describe("BUILD_SHA", () => {
  it("is a non-empty build identifier", () => {
    expect(BUILD_SHA.length).toBeGreaterThan(0);
    expect(BUILD_SHA.length).toBeLessThanOrEqual(7);
  });
});

import { describe, expect, it } from "vitest";
import { formatBuildTag } from "./buildInfo";

describe("formatBuildTag", () => {
  it("uses the first 7 characters of a full SHA", () => {
    expect(formatBuildTag("ece6829abc123")).toBe("ece6829");
  });

  it("falls back to dev when missing", () => {
    expect(formatBuildTag(undefined)).toBe("dev");
    expect(formatBuildTag("")).toBe("dev");
    expect(formatBuildTag("   ")).toBe("dev");
  });
});

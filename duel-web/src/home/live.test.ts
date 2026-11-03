import { describe, expect, it } from "vitest";
import { LIVE_MIN_ONLINE, liveSummary } from "./live";

describe("Live matches summary", () => {
  it("counts matches being played now and says 1 match, not 1 matches (#930)", () => {
    expect(liveSummary({ online: 0, matches: 3 })?.text).toBe("3 matches being played now");
    expect(liveSummary({ online: 0, matches: 1 })?.text).toBe("1 match being played now");
  });

  it("always shows the match count, even with almost nobody online (#930)", () => {
    expect(liveSummary({ online: 1, matches: 2 })?.text).toBe("2 matches being played now");
    expect(liveSummary({ online: 0, matches: 0 })?.text).toBe("0 matches being played now");
  });

  it("adds players online at exactly the threshold and hides it just below (#930)", () => {
    expect(liveSummary({ online: LIVE_MIN_ONLINE, matches: 2 })?.text).toBe("2 matches being played now · 5 online");
    expect(liveSummary({ online: LIVE_MIN_ONLINE - 1, matches: 2 })?.text).toBe("2 matches being played now");
  });

  it("flags the empty state only when no match is being played (#930)", () => {
    expect(liveSummary({ online: 9, matches: 0 })?.empty).toBe(true);
    expect(liveSummary({ online: 9, matches: 1 })?.empty).toBe(false);
  });

  it("shows nothing while the counts are missing (#930)", () => {
    expect(liveSummary(null)).toBeNull();
    expect(liveSummary(undefined)).toBeNull();
  });
});

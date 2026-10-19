import { describe, expect, it } from "vitest";
import { LIVE_MIN_ONLINE, liveLine } from "./live";

describe("Live counts line", () => {
  it("writes online players and matches in progress (#431)", () => {
    expect(liveLine({ online: 38, matches: 11 })).toBe("38 online · 11 matches in progress");
  });

  it("says 1 match, not 1 matches, and keeps 0 matches plural (#431)", () => {
    expect(liveLine({ online: 12, matches: 1 })).toBe("12 online · 1 match in progress");
    expect(liveLine({ online: 12, matches: 0 })).toBe("12 online · 0 matches in progress");
  });

  it("shows at exactly the threshold and hides just below it (#431)", () => {
    expect(liveLine({ online: LIVE_MIN_ONLINE, matches: 2 })).toBe("5 online · 2 matches in progress");
    expect(liveLine({ online: LIVE_MIN_ONLINE - 1, matches: 2 })).toBeNull();
  });

  it("shows nothing while the counts are missing (#431)", () => {
    expect(liveLine(null)).toBeNull();
    expect(liveLine(undefined)).toBeNull();
  });
});

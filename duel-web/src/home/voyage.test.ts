import { describe, expect, it } from "vitest";
import { recordLabel, streak, streakLabel } from "./voyage";

const g = (won: boolean, finished?: boolean) => ({ won, finished });

describe("Your voyage", () => {
  it("counts the streak from the newest finished game (#431)", () => {
    expect(streak([g(true), g(true), g(true), g(false), g(true)])).toEqual({ won: true, count: 3 });
    expect(streak([g(false), g(true), g(true)])).toEqual({ won: false, count: 1 });
  });

  it("skips cut-off games without breaking or starting a streak (#431)", () => {
    expect(streak([g(false, false), g(true), g(true, false), g(true), g(false)])).toEqual({ won: true, count: 2 });
    expect(streak([g(true, false), g(false), g(false)])).toEqual({ won: false, count: 2 });
  });

  it("has no streak without a finished game (#431)", () => {
    expect(streak([])).toBeNull();
    expect(streak([g(true, false)])).toBeNull();
  });

  it("writes W3, L1 and a dash for no streak (#431)", () => {
    expect(streakLabel({ won: true, count: 3 })).toBe("W3");
    expect(streakLabel({ won: false, count: 1 })).toBe("L1");
    expect(streakLabel(null)).toBe("—");
  });

  it("writes the record as wins–losses (#431)", () => {
    expect(recordLabel(24, 17)).toBe("24–17");
  });
});

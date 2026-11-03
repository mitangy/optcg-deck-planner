import { describe, expect, it } from "vitest";
import { FIRST_TOUCH_KEY, FIRST_TOUCH_TTL_MS, captureFirstTouch, readFirstTouch } from "./firstTouch";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}
const NOW = 1_800_000_000_000;
const here = (search = "", pathname = "/") => ({ hostname: "optcgduel.app", pathname, search });

describe("first-touch source (#905)", () => {
  it("stores an external referrer host without www, with the landing path (#905)", () => {
    const s = memoryStorage();
    captureFirstTouch(here("", "/decks"), "https://www.google.com/search?q=optcg", s, NOW);
    expect(readFirstTouch(s, NOW)).toEqual({ ref: "google.com", land: "/decks", at: NOW });
  });

  it("ignores our own domains, the API and the Google OAuth bounce (#905)", () => {
    for (const referrer of [
      "https://optcgduel.app/lobby",
      "https://www.optcg-deck-planner.app/",
      "https://optcg-api.onrender.com/auth/callback",
      "https://accounts.google.com/o/oauth2/auth",
      "",
    ]) {
      const s = memoryStorage();
      captureFirstTouch(here(), referrer, s, NOW);
      expect(s.data.size, referrer).toBe(0);
    }
  });

  it("stores utm tags without a referrer, each cut to 60 characters (#905)", () => {
    const s = memoryStorage();
    captureFirstTouch(here(`?utm_source=instagram&utm_medium=paid&utm_campaign=${"c".repeat(80)}`), "", s, NOW);
    expect(readFirstTouch(s, NOW)).toEqual({
      land: "/",
      utm_source: "instagram",
      utm_medium: "paid",
      utm_campaign: "c".repeat(60),
      at: NOW,
    });
  });

  it("keeps the first touch when a later visit has a different source (#905)", () => {
    const s = memoryStorage();
    captureFirstTouch(here(), "https://reddit.com/r/OPTCG", s, NOW);
    captureFirstTouch(here(), "https://google.com/", s, NOW + 1000);
    expect(readFirstTouch(s, NOW + 1000)?.ref).toBe("reddit.com");
  });

  it("lets a new visit replace a first touch older than 30 days (#905)", () => {
    const s = memoryStorage();
    captureFirstTouch(here(), "https://reddit.com/", s, NOW);
    const later = NOW + FIRST_TOUCH_TTL_MS + 1;
    expect(readFirstTouch(s, later)).toBeNull();
    captureFirstTouch(here(), "https://google.com/", s, later);
    expect(readFirstTouch(s, later)?.ref).toBe("google.com");
    expect(JSON.parse(s.data.get(FIRST_TOUCH_KEY)!).at).toBe(later);
  });

  it("does not throw when storage is blocked (#905)", () => {
    const blocked = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(() => captureFirstTouch(here(), "https://google.com/", blocked, NOW)).not.toThrow();
    expect(readFirstTouch(blocked, NOW)).toBeNull();
  });
});

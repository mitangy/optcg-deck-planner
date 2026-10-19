import { describe, expect, it } from "vitest";
import { INTRO_KEY, introDone, introVisible, markIntroDone } from "./intro";

type Store = Pick<Storage, "getItem" | "setItem">;
function memory(seed: Record<string, string> = {}): Store & { data: Record<string, string> } {
  const data = { ...seed };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe("how it works strip", () => {
  it("shows to guests who have not dismissed it or started a match (#431)", () => {
    expect(introVisible("guest", false)).toBe(true);
    expect(introVisible("guest", true)).toBe(false);
  });

  it("never shows to signed-in players (#431)", () => {
    expect(introVisible("google", false)).toBe(false);
    expect(introVisible("dev", false)).toBe(false);
  });

  it("remembers dismissal and survives blocked storage (#431)", () => {
    const s = memory();
    expect(introDone(s)).toBe(false);
    markIntroDone(s);
    expect(s.data[INTRO_KEY]).toBe("1");
    expect(introDone(s)).toBe(true);
    const blocked: Store = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(introDone(blocked)).toBe(false);
    expect(() => markIntroDone(blocked)).not.toThrow();
  });
});

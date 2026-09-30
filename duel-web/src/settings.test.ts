import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSettings } from "./settings";

function stubStored(value: unknown) {
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(value) });
}

describe("loadSettings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps valid stored gameplay choices", () => {
    stubStored({ endTurnConfirm: "never", autoPassDefense: true });
    const s = loadSettings();
    expect(s.endTurnConfirm).toBe("never");
    expect(s.autoPassDefense).toBe(true);
  });

  it("falls back per field when a stored value is invalid", () => {
    stubStored({ endTurnConfirm: "sometimes", turnSplash: "no", autoPassDefense: true });
    const s = loadSettings();
    expect(s.endTurnConfirm).toBe("always");
    expect(s.turnSplash).toBe(true);
    expect(s.autoPassDefense).toBe(true);
  });
});

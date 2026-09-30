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
    stubStored({ endTurnConfirm: "never", responseStops: "smart" });
    const s = loadSettings();
    expect(s.endTurnConfirm).toBe("never");
    expect(s.responseStops).toBe("smart");
  });

  it("falls back per field when a stored value is invalid", () => {
    stubStored({ endTurnConfirm: "sometimes", turnSplash: "no", responseStops: "smart" });
    const s = loadSettings();
    expect(s.endTurnConfirm).toBe("always");
    expect(s.turnSplash).toBe(true);
    expect(s.responseStops).toBe("smart");
  });
});

describe("response stops migration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("turns the old auto-pass switch on into auto", () => {
    stubStored({ autoPassDefense: true });
    expect(loadSettings().responseStops).toBe("auto");
  });

  it("turns the old switch off, or missing, into always", () => {
    stubStored({ autoPassDefense: false });
    expect(loadSettings().responseStops).toBe("always");
    stubStored({});
    expect(loadSettings().responseStops).toBe("always");
  });

  it("falls back to always for an unknown value", () => {
    stubStored({ responseStops: "banana" });
    expect(loadSettings().responseStops).toBe("always");
    stubStored({ responseStops: 3 });
    expect(loadSettings().responseStops).toBe("always");
  });

  it("lets a saved choice beat the old switch", () => {
    stubStored({ responseStops: "smart", autoPassDefense: true });
    expect(loadSettings().responseStops).toBe("smart");
    stubStored({ responseStops: "always", autoPassDefense: true });
    expect(loadSettings().responseStops).toBe("always");
  });

  it("drops the old key from what it returns", () => {
    stubStored({ autoPassDefense: true });
    expect("autoPassDefense" in loadSettings()).toBe(false);
  });
});

describe("screen orientation setting", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a saved lock and falls back to following the phone otherwise", () => {
    stubStored({ screenOrientation: "landscape" });
    expect(loadSettings().screenOrientation).toBe("landscape");
    stubStored({ screenOrientation: "upside-down" });
    expect(loadSettings().screenOrientation).toBe("auto");
    stubStored({});
    expect(loadSettings().screenOrientation).toBe("auto");
  });
});

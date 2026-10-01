import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSettings, mergeRemoteSettings, syncedSettings } from "./settings";

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

describe("animation speed", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a stored speed", () => {
    stubStored({ animationSpeed: "fast" });
    expect(loadSettings().animationSpeed).toBe("fast");
    stubStored({ animationSpeed: "off" });
    expect(loadSettings().animationSpeed).toBe("off");
  });

  it("defaults to normal, and replaces an unknown stored speed with it", () => {
    stubStored({});
    expect(loadSettings().animationSpeed).toBe("normal");
    stubStored({ animationSpeed: "warp" });
    expect(loadSettings().animationSpeed).toBe("normal");
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

describe("hand layout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a stored hand layout", () => {
    stubStored({ handLayout: "grid" });
    expect(loadSettings().handLayout).toBe("grid");
    stubStored({ handLayout: "fanRight" });
    expect(loadSettings().handLayout).toBe("fanRight");
  });

  it("replaces an unknown stored hand layout with the centre fan", () => {
    stubStored({ handLayout: "dock" });
    expect(loadSettings().handLayout).toBe("fanCenter");
  });
});

describe("account settings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never sends device-only fields to the account", () => {
    stubStored({ useDevKey: true, devUserKey: "mine", handLayout: "grid" });
    const synced = syncedSettings(loadSettings());
    expect(synced.handLayout).toBe("grid");
    expect(synced).not.toHaveProperty("useDevKey");
    expect(synced).not.toHaveProperty("devUserKey");
  });

  it("applies account settings but keeps this device's device-only fields", () => {
    stubStored({ useDevKey: true, devUserKey: "mine", handLayout: "fanRight" });
    const merged = mergeRemoteSettings(loadSettings(), {
      handLayout: "grid",
      turnSound: true,
      useDevKey: false,
      devUserKey: "other",
    });
    expect(merged.handLayout).toBe("grid");
    expect(merged.turnSound).toBe(true);
    expect(merged.useDevKey).toBe(true);
    expect(merged.devUserKey).toBe("mine");
  });
});

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
    stubStored({ handLayout: "fan" });
    expect(loadSettings().handLayout).toBe("fan");
  });

  it("replaces an unknown stored hand layout with the fan", () => {
    stubStored({ handLayout: "dock" });
    expect(loadSettings().handLayout).toBe("fan");
  });

  it("turns the old centre and right fans into the one fan, the right one kept at the bottom right (#261)", () => {
    stubStored({ handLayout: "fanCenter" });
    expect(loadSettings()).toMatchObject({ handLayout: "fan", handFanPos: "" });
    stubStored({ handLayout: "fanRight" });
    expect(loadSettings()).toMatchObject({ handLayout: "fan", handFanPos: "0.88,1" });
    // A spot saved since then wins over the old right fan.
    stubStored({ handLayout: "fanRight", handFanPos: "0.2,0.5" });
    expect(loadSettings().handFanPos).toBe("0.2,0.5");
  });

  it("keeps a pinned opponent hand spot and drops an unknown one (#264)", () => {
    stubStored({ oppHandSpot: "centre" });
    expect(loadSettings().oppHandSpot).toBe("centre");
    stubStored({ oppHandSpot: "bottom" });
    expect(loadSettings().oppHandSpot).toBe("");
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
    stubStored({ useDevKey: true, devUserKey: "mine", handLayout: "fan" });
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

describe("hand, one-tap and text size settings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the hand open for a player who saved Keep hand open (#247)", () => {
    stubStored({ keepHandOpen: true });
    expect(loadSettings().keepHandOpen).toBe(true);
  });

  it("keeps a stored text size and replaces an unknown one with medium (#247)", () => {
    stubStored({ textSize: "xlarge" });
    expect(loadSettings().textSize).toBe("xlarge");
    stubStored({ textSize: "huge" });
    expect(loadSettings().textSize).toBe("medium");
  });
});

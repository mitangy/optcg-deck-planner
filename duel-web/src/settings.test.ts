import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSettings, mergeRemoteSettings, resolveHandLayout, syncedSettings } from "./settings";

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
    expect(s.endTurnConfirm).toBe("actions");
    expect(s.turnSplash).toBe(true);
    expect(s.responseStops).toBe("smart");
  });
});

describe("DON!! art setting (#440)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a stored product id and defaults to the bundled art", () => {
    stubStored({ donArt: 512345 });
    expect(loadSettings().donArt).toBe(512345);
    stubStored({});
    expect(loadSettings().donArt).toBeNull();
  });

  it("falls back to the bundled art for anything that is not a positive integer", () => {
    for (const bad of ["512345", -3, 0, 2.5, true, {}, "https://evil.example/x.jpg"]) {
      stubStored({ donArt: bad });
      expect(loadSettings().donArt, String(bad)).toBeNull();
    }
  });

  it("follows the account: a chosen art is saved, and the default saves as 0 and loads back as null", () => {
    stubStored({ donArt: 512345 });
    expect(syncedSettings(loadSettings()).donArt).toBe(512345);
    stubStored({});
    expect(syncedSettings(loadSettings()).donArt).toBe(0);
    expect(mergeRemoteSettings(loadSettings(), { donArt: 0 }).donArt).toBeNull();
    stubStored({ donArt: 7 });
    expect(mergeRemoteSettings(loadSettings(), { donArt: 0 }).donArt).toBeNull();
    expect(mergeRemoteSettings(loadSettings(), { donArt: 99 }).donArt).toBe(99);
  });
});

describe("end-turn confirm default", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks only while DON!! or attackers are left for players who never chose, and keeps a saved Always ask (#282)", () => {
    stubStored({});
    expect(loadSettings().endTurnConfirm).toBe("actions");
    stubStored({ endTurnConfirm: "always" });
    expect(loadSettings().endTurnConfirm).toBe("always");
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

  it("defaults to auto on a phone-sized touch screen and always elsewhere (#276)", () => {
    const phone = (matches: boolean) =>
      vi.stubGlobal("matchMedia", (q: string) => ({ matches: matches && q.includes("pointer: coarse") }));
    phone(true);
    stubStored({});
    expect(loadSettings().responseStops).toBe("auto");
    // A stored choice still wins over the device default.
    stubStored({ responseStops: "always" });
    expect(loadSettings().responseStops).toBe("always");
    phone(false);
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

  it("starts on automatic for a player who never chose, and for an unknown stored value (#281)", () => {
    stubStored({});
    expect(loadSettings().handLayout).toBe("auto");
    stubStored({ handLayout: "dock" });
    expect(loadSettings().handLayout).toBe("auto");
  });

  it("automatic is the Grid only on a tall desktop window; a saved choice always wins (#281)", () => {
    expect(resolveHandLayout("auto", true)).toBe("grid");
    expect(resolveHandLayout("auto", false)).toBe("fan");
    expect(resolveHandLayout("fan", true)).toBe("fan");
    expect(resolveHandLayout("grid", false)).toBe("grid");
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

  it("turns the old Opponent hand, top right switch into the hand pinned top right (#297)", () => {
    stubStored({ oppHandTopRight: true });
    expect(loadSettings().oppHandSpot).toBe("right");
    // A spot picked since wins, and off keeps the side panel.
    stubStored({ oppHandTopRight: true, oppHandSpot: "left" });
    expect(loadSettings().oppHandSpot).toBe("left");
    stubStored({ oppHandTopRight: false });
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

  it("keeps where pop-ups open on this device, not the account (#422)", () => {
    stubStored({ promptPos: "-40,-200" });
    expect(syncedSettings(loadSettings())).not.toHaveProperty("promptPos");
    expect(mergeRemoteSettings(loadSettings(), { promptPos: "9,9" }).promptPos).toBe("-40,-200");
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

  it("keeps the old right and centre fans from the account over this device's fan spot (#261)", () => {
    stubStored({ handLayout: "fan", handFanPos: "0.2,0.5" });
    expect(mergeRemoteSettings(loadSettings(), { handLayout: "fanRight" })).toMatchObject({
      handLayout: "fan",
      handFanPos: "0.88,1",
    });
    expect(mergeRemoteSettings(loadSettings(), { handLayout: "fanCenter" })).toMatchObject({
      handLayout: "fan",
      handFanPos: "",
    });
    // A spot the account saved since then still wins.
    expect(
      mergeRemoteSettings(loadSettings(), { handLayout: "fanRight", handFanPos: "0.4,1" }).handFanPos,
    ).toBe("0.4,1");
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

describe("Show on screen and Bigger playing area (#449)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("follow the account: saved with it and applied from it", () => {
    stubStored({});
    const synced = syncedSettings(loadSettings());
    expect(synced).toMatchObject({ bigBoard: false, showChat: true, showRecentPlays: true, showCardPreview: true });
    const merged = mergeRemoteSettings(loadSettings(), {
      bigBoard: true,
      showChat: false,
      showRecentPlays: false,
      showCardPreview: false,
    });
    expect(merged).toMatchObject({ bigBoard: true, showChat: false, showRecentPlays: false, showCardPreview: false });
  });
});

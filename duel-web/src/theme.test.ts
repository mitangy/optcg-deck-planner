import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSettings, mergeRemoteSettings } from "./settings";
import { applyTheme, type ThemeTarget } from "./theme";

/**
 * A page stand-in whose background follows data-theme and data-mode, like
 * themes.css. Light backgrounds are keyed "<theme>/light".
 */
function fakePage(backgrounds: Record<string, string>) {
  const meta = { content: "#0b1720", setAttribute: (_n: string, v: string) => (meta.content = v) };
  const root = { dataset: {} as DOMStringMap };
  const device = { light: false };
  const target: ThemeTarget = {
    root,
    deviceLight: () => device.light,
    themeColorMeta: meta,
    background: () => {
      const theme = root.dataset.theme ?? "nightSea";
      return backgrounds[root.dataset.mode ? `${theme}/light` : theme] ?? "";
    },
  };
  return { meta, root, device, target };
}

describe("colour themes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tints the status bar with the chosen theme's background (#240)", () => {
    const page = fakePage({ nightSea: "#0b1720", donquixote: " #170a14" });
    applyTheme("donquixote", "dark", page.target);
    expect(page.root.dataset.theme).toBe("donquixote");
    expect(page.meta.content).toBe("#170a14");
    applyTheme("nightSea", "dark", page.target);
    expect(page.root.dataset.theme).toBeUndefined();
    expect(page.meta.content).toBe("#0b1720");
  });

  it("replaces a stored theme this build doesn't know with the default (#240)", () => {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ theme: "baroqueWorks" }) });
    expect(loadSettings().theme).toBe("nightSea");
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ theme: "wano" }) });
    expect(loadSettings().theme).toBe("wano");
  });

  it("takes the theme saved to the account on another device (#240)", () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    const local = loadSettings();
    expect(mergeRemoteSettings(local, { theme: "marines" }).theme).toBe("marines");
  });

  it("light mode brightens the page and tints the status bar to match (#241)", () => {
    const page = fakePage({ nightSea: "#0b1720", "nightSea/light": "#e9f1f7" });
    applyTheme("nightSea", "light", page.target);
    expect(page.root.dataset.mode).toBe("light");
    expect(page.meta.content).toBe("#e9f1f7");
    applyTheme("nightSea", "dark", page.target);
    expect(page.root.dataset.mode).toBeUndefined();
    expect(page.meta.content).toBe("#0b1720");
  });

  it("Auto mode follows the device's light or dark setting (#241)", () => {
    const page = fakePage({ wano: "#140b10", "wano/light": "#eee9f7" });
    page.device.light = true;
    applyTheme("wano", "system", page.target);
    expect(page.root.dataset.mode).toBe("light");
    expect(page.meta.content).toBe("#eee9f7");
    page.device.light = false;
    applyTheme("wano", "system", page.target);
    expect(page.root.dataset.mode).toBeUndefined();
    expect(page.meta.content).toBe("#140b10");
  });

  it("replaces a stored colour mode this build doesn't know with dark (#241)", () => {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ colorMode: "sepia" }) });
    expect(loadSettings().colorMode).toBe("dark");
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ colorMode: "light" }) });
    expect(loadSettings().colorMode).toBe("light");
  });

  it("takes the light or dark mode saved to the account on another device (#241)", () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    const local = loadSettings();
    expect(mergeRemoteSettings(local, { colorMode: "system" }).colorMode).toBe("system");
  });
});

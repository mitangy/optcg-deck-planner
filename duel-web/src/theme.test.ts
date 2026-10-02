import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSettings, mergeRemoteSettings } from "./settings";
import { applyTheme, type ThemeTarget } from "./theme";

/** A page stand-in whose background follows data-theme, like themes.css. */
function fakePage(backgrounds: Record<string, string>) {
  const meta = { content: "#0b1720", setAttribute: (_n: string, v: string) => (meta.content = v) };
  const root = { dataset: {} as DOMStringMap };
  const target: ThemeTarget = {
    root,
    themeColorMeta: meta,
    background: () => backgrounds[root.dataset.theme ?? "nightSea"] ?? "",
  };
  return { meta, root, target };
}

describe("colour themes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tints the status bar with the chosen theme's background (#PRNUM)", () => {
    const page = fakePage({ nightSea: "#0b1720", donquixote: " #170a14" });
    applyTheme("donquixote", page.target);
    expect(page.root.dataset.theme).toBe("donquixote");
    expect(page.meta.content).toBe("#170a14");
    applyTheme("nightSea", page.target);
    expect(page.root.dataset.theme).toBeUndefined();
    expect(page.meta.content).toBe("#0b1720");
  });

  it("replaces a stored theme this build doesn't know with the default (#PRNUM)", () => {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ theme: "baroqueWorks" }) });
    expect(loadSettings().theme).toBe("nightSea");
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ theme: "wano" }) });
    expect(loadSettings().theme).toBe("wano");
  });

  it("takes the theme saved to the account on another device (#PRNUM)", () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    const local = loadSettings();
    expect(mergeRemoteSettings(local, { theme: "marines" }).theme).toBe("marines");
  });
});

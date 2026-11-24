import { describe, expect, it } from "vitest";
import { PANEL_SEARCH, gameplayTitleMatches, panelMatches, type PanelId } from "./settingsSearch";

const shown = (q: string) => (Object.keys(PANEL_SEARCH) as PanelId[]).filter((id) => panelMatches(id, q));

describe("Settings search over the other panels (#1389)", () => {
  it("a blank search keeps every panel (#1389)", () => {
    expect(shown("")).toHaveLength(Object.keys(PANEL_SEARCH).length);
  });

  it("a panel shows when its title or a keyword matches, and hides otherwise (#1389)", () => {
    expect(shown("username")).toEqual(["account"]);
    expect(shown("dark")).toEqual(["theme"]);
    expect(shown("version")).toEqual(["about"]);
  });

  it("every word has to match the same panel (#1389)", () => {
    expect(shown("dark username")).toEqual([]);
  });

  it("the Gameplay title keeps the whole Gameplay panel (#1389)", () => {
    expect(gameplayTitleMatches("gameplay")).toBe(true);
    expect(gameplayTitleMatches("sound")).toBe(false);
  });
});

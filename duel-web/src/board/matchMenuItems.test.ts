import { describe, expect, it } from "vitest";
import { matchMenuItems } from "./matchMenuItems";

const live = { spectating: false, over: false, hotseat: false, fullscreenOffered: false, canConcede: true };

describe("match menu items", () => {
  it("a replay's menu has no room links or concede (#476)", () => {
    const items = matchMenuItems({ ...live, spectating: true, replay: true });
    for (const id of ["copy-room", "copy-spectate", "concede"] as const) expect(items).not.toContain(id);
    expect(items).toContain("settings");
    expect(items).toContain("leave");
    // Live play keeps them.
    expect(matchMenuItems(live)).toContain("copy-room");
  });

  it("offers Concede to a live player", () => {
    expect(matchMenuItems(live)).toContain("concede");
  });

  it("gives spectators no Concede", () => {
    expect(matchMenuItems({ ...live, spectating: true })).not.toContain("concede");
  });

  it("gives a finished match no Concede", () => {
    expect(matchMenuItems({ ...live, over: true })).not.toContain("concede");
  });

  it("has no Concede when the page cannot concede", () => {
    expect(matchMenuItems({ ...live, canConcede: false })).not.toContain("concede");
  });

  it("has no Copy room in hotseat but offers it online", () => {
    expect(matchMenuItems({ ...live, hotseat: true })).not.toContain("copy-room");
    expect(matchMenuItems(live)).toContain("copy-room");
  });

  it("offers Copy spectate link to online players and spectators, not hotseat (#346)", () => {
    expect(matchMenuItems(live)).toContain("copy-spectate");
    expect(matchMenuItems({ ...live, spectating: true, canConcede: false })).toContain("copy-spectate");
    expect(matchMenuItems({ ...live, hotseat: true })).not.toContain("copy-spectate");
  });

  it("offers Full screen only when the browser offers it", () => {
    expect(matchMenuItems({ ...live, fullscreenOffered: true })).toContain("fullscreen");
    expect(matchMenuItems(live)).not.toContain("fullscreen");
  });

  it("offers Reload in every match, hotseat and spectating included", () => {
    expect(matchMenuItems(live)).toContain("reload");
    expect(matchMenuItems({ ...live, hotseat: true })).toContain("reload");
    expect(matchMenuItems({ ...live, spectating: true, over: true })).toContain("reload");
  });

  it("offers Report a problem in every match, right after Reload and before Concede (#371)", () => {
    for (const o of [live, { ...live, hotseat: true }, { ...live, spectating: true, over: true }]) {
      const items = matchMenuItems(o);
      expect(items.indexOf("report")).toBe(items.indexOf("reload") + 1);
    }
    const items = matchMenuItems(live);
    expect(items.indexOf("report")).toBeLessThan(items.indexOf("concede"));
  });

  it("always ends with Leave, after Concede", () => {
    const items = matchMenuItems({ ...live, fullscreenOffered: true });
    expect(items[items.length - 1]).toBe("leave");
    expect(items.indexOf("concede")).toBeLessThan(items.indexOf("leave"));
  });
});

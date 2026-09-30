import { describe, expect, it } from "vitest";
import { matchMenuItems } from "./matchMenuItems";

const live = { spectating: false, over: false, hotseat: false, fullscreenOffered: false, canConcede: true };

describe("match menu items", () => {
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

  it("offers Full screen only when the browser offers it", () => {
    expect(matchMenuItems({ ...live, fullscreenOffered: true })).toContain("fullscreen");
    expect(matchMenuItems(live)).not.toContain("fullscreen");
  });

  it("always ends with Leave, after Concede", () => {
    const items = matchMenuItems({ ...live, fullscreenOffered: true });
    expect(items[items.length - 1]).toBe("leave");
    expect(items.indexOf("concede")).toBeLessThan(items.indexOf("leave"));
  });
});

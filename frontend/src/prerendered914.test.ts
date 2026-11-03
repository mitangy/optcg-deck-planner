// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  document.body.innerHTML = "";
  vi.resetModules();
});

describe("pre-rendered page markers (#914)", () => {
  it("reads the leaders the build embedded, and nothing from a broken or incomplete script (#914)", async () => {
    const { readMetaSeed } = await import("./prerendered");
    expect(readMetaSeed()).toBeNull();
    document.body.innerHTML = '<script type="application/json" id="meta-seed">{"generatedAt":"2026-11-03T05:00:00Z","days":30,"leaders":{"leaders":[]}}</script>';
    expect(readMetaSeed()).toMatchObject({ days: 30, generatedAt: "2026-11-03T05:00:00Z" });
    document.body.innerHTML = '<script type="application/json" id="meta-seed">{"days":30}</script>';
    expect(readMetaSeed()).toBeNull();
    document.body.innerHTML = '<script type="application/json" id="meta-seed">{oops</script>';
    expect(readMetaSeed()).toBeNull();
  });

  it("knows the page came from the pre-render only when #root is marked (#914)", async () => {
    document.body.innerHTML = '<div id="root"></div>';
    vi.resetModules();
    expect((await import("./prerendered")).WAS_PRERENDERED).toBe(false);
    document.body.innerHTML = '<div id="root" data-prerendered><p>hi</p></div>';
    vi.resetModules();
    expect((await import("./prerendered")).WAS_PRERENDERED).toBe(true);
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { applyPageMeta, usePageMeta } from "./pageMeta";

const ORIGIN = "https://example.test";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.head.innerHTML = "";
  document.title = "";
});

const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null;
const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null;

describe("applyPageMeta (#804)", () => {
  it("removes the noindex a private page left behind when an indexable page opens (#804)", () => {
    applyPageMeta({ title: "Private", path: "/history", origin: ORIGIN, noindex: true });
    expect(robots()).toBe("noindex");
    applyPageMeta({ title: "Public", path: "/leaderboard", origin: ORIGIN });
    expect(robots()).toBeNull();
    expect(canonical()).toBe("https://example.test/leaderboard");
  });

  it("builds the canonical link from the pathname without query or hash (#804)", () => {
    applyPageMeta({ title: "T", path: "/decks/meta?utm_source=x#top", origin: `${ORIGIN}/` });
    expect(canonical()).toBe("https://example.test/decks/meta");
  });

  it("drops the canonical link on a noindex page (#804)", () => {
    applyPageMeta({ title: "Public", path: "/", origin: ORIGIN });
    expect(canonical()).toBe("https://example.test/");
    applyPageMeta({ title: "Private", path: "/settings", origin: ORIGIN, noindex: true });
    expect(canonical()).toBeNull();
  });

  it("sets the title and description and keeps a single description tag (#804)", () => {
    applyPageMeta({ title: "One", description: "first", origin: ORIGIN });
    applyPageMeta({ title: "Two", description: "second", origin: ORIGIN });
    expect(document.title).toBe("Two");
    const tags = document.head.querySelectorAll('meta[name="description"]');
    expect(tags).toHaveLength(1);
    expect(tags[0].getAttribute("content")).toBe("second");
  });

  it("updates the social tags the page already has and does not add new ones (#804)", () => {
    document.head.innerHTML =
      '<meta property="og:title" content="old"><meta property="og:description" content="old"><meta property="og:url" content="old"><meta name="twitter:title" content="old">';
    applyPageMeta({ title: "New", description: "desc", path: "/terms", origin: ORIGIN });
    const get = (sel: string) => document.head.querySelector(sel)?.getAttribute("content");
    expect(get('meta[property="og:title"]')).toBe("New");
    expect(get('meta[property="og:description"]')).toBe("desc");
    expect(get('meta[property="og:url"]')).toBe("https://example.test/terms");
    expect(get('meta[name="twitter:title"]')).toBe("New");
    expect(document.head.querySelector('meta[name="twitter:description"]')).toBeNull();
  });
});

describe("usePageMeta (#804)", () => {
  it("applies the meta again when the path changes (#804)", () => {
    function Probe({ path, noindex }: { path: string; noindex?: boolean }) {
      usePageMeta({ title: path, path, origin: ORIGIN, noindex });
      return null;
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(<Probe path="/settings" noindex />));
    expect(robots()).toBe("noindex");
    act(() => root.render(<Probe path="/terms" />));
    expect(robots()).toBeNull();
    expect(document.title).toBe("/terms");
    act(() => root.unmount());
  });
});

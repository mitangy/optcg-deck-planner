// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PlayOnlinePage, PLAY_ONLINE_FAQ } from "./PlayOnlinePage";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 404 })));
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.head.innerHTML = "";
});

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<MemoryRouter><PlayOnlinePage /></MemoryRouter>));
}

const faqLd = () => document.head.querySelector('script[type="application/ld+json"]');

describe("/play-one-piece-tcg-online (#804)", () => {
  it("publishes the visible FAQ as FAQPage data and removes it when the page closes (#804)", () => {
    mount();
    const data = JSON.parse(faqLd()?.textContent ?? "{}");
    expect(data["@type"]).toBe("FAQPage");
    expect(data.mainEntity.map((e: { name: string; acceptedAnswer: { text: string } }) => [e.name, e.acceptedAnswer.text])).toEqual(
      PLAY_ONLINE_FAQ.map((i) => [i.q, i.a]),
    );
    for (const item of PLAY_ONLINE_FAQ) {
      expect(host!.textContent).toContain(item.q);
      expect(host!.textContent).toContain(item.a);
    }
    act(() => root!.unmount());
    root = null;
    expect(faqLd()).toBeNull();
  });

  it("has one h1, Play now links home and a meta decks link (#804)", () => {
    mount();
    expect(host!.querySelectorAll("h1")).toHaveLength(1);
    const links = [...host!.querySelectorAll("a")];
    const hrefOf = (label: string) => links.filter((a) => a.textContent === label).map((a) => a.getAttribute("href"));
    expect(hrefOf("Play now").length).toBeGreaterThan(0);
    expect(hrefOf("Play now").every((h) => h === "/")).toBe(true);
    expect(hrefOf("Browse meta decks")).toEqual(["/decks/meta"]);
  });
});

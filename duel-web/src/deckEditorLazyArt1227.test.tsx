// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { DeckEditor } from "./board/DeckEditor";
import { CardArt } from "./cards/CardArt";
import type { SavedDeck } from "./decks/storage";

let root: Root | null = null;
let host: HTMLElement | null = null;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const deck = { id: "d1", name: "Test", leaderId: "OP01-001", cards: [], updatedAt: 0 } as unknown as SavedDeck;

describe("deck editor art loading (#1227)", () => {
  it("search result art loads lazily and off the main thread, as the list can be hundreds long (#1227)", { timeout: 30000 }, async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<DeckEditor deck={deck} onChange={() => {}} />));
    const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "luffy");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // The list follows the deferred query: wait for it rather than assume one flush is enough.
    for (let i = 0; i < 20 && !host.querySelector(".deck-search-thumb img"); i++) {
      await act(async () => void (await new Promise((r) => setTimeout(r, 25))));
    }
    const imgs = [...host.querySelectorAll<HTMLImageElement>(".deck-search-thumb img")];
    expect(imgs.length).toBeGreaterThan(5);
    for (const img of imgs) {
      expect(img.getAttribute("loading")).toBe("lazy");
      expect(img.getAttribute("decoding")).toBe("async");
    }
  });

  it("board card art stays eager unless a list asks for lazy (#1227)", () => {
    const html = renderToStaticMarkup(
      <CardArt src="https://example.test/a.png" defId="OP01-001" fallback={<span>x</span>} />,
    );
    expect(html).toContain("<img");
    expect(html).not.toContain("loading=");
    expect(html).not.toContain("decoding=");
  });
});

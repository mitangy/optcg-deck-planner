// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DeckListPage } from "./DeckListPage";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  Object.defineProperty(HTMLElement.prototype, "innerText", { configurable: true, get() { return (this as HTMLElement).textContent; } });
  Element.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 404 })));
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  localStorage.clear();
});

const SEEDED = [
  { id: "d1", name: "Alpha", leaderId: "OP11-041", cards: Array(50).fill("ST01-003"), updatedAt: 3 },
  { id: "d2", name: "Bravo", leaderId: "OP13-079", cards: Array(42).fill("ST01-003"), updatedAt: 2 },
];

async function mount() {
  localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify(SEEDED));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={["/decks"]}>
        <Routes>
          <Route path="/decks" element={<DeckListPage />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 100));
  });
}

const names = () => Array.from(document.querySelectorAll(".deck-card-name")).map((n) => n.textContent);

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("Decks page cards (#747)", () => {
  it("typing a leader's name in the search box leaves only that leader's deck cards (#747)", async () => {
    await mount();
    expect(names()).toContain("Alpha");
    expect(names()).toContain("Bravo");
    await type(document.querySelector<HTMLInputElement>('input[type="search"]')!, "imu");
    expect(names()).toEqual(["Bravo"]);
  });

  it("flags only the deck under 50 cards as incomplete, with its count (#747)", async () => {
    await mount();
    const warns = Array.from(document.querySelectorAll(".deck-card-warn")).map((w) => w.textContent);
    expect(warns).toEqual(["Incomplete: 42 of 50 main-deck cards"]);
  });
});

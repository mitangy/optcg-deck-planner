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

async function mount(seed: object[] = SEEDED) {
  localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify(seed));
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

describe("Decks page cards (#750)", () => {
  it("typing a leader's name in the search box leaves only that leader's deck cards (#750)", async () => {
    await mount();
    expect(names()).toContain("Alpha");
    expect(names()).toContain("Bravo");
    await type(document.querySelector<HTMLInputElement>('input[type="search"]')!, "imu");
    expect(names()).toEqual(["Bravo"]);
  });

  it("flags only the deck under 50 cards as incomplete, with its count (#750)", async () => {
    await mount();
    const warns = Array.from(document.querySelectorAll(".deck-card-warn")).map((w) => w.textContent);
    expect(warns).toEqual(["Incomplete: 42 of 50 main-deck cards"]);
  });
});

describe("Add to planner menu item (#1017)", () => {
  async function menuLabels(deckName: string, signedIn: boolean, seed: object[] = SEEDED) {
    vi.stubGlobal("fetch", (url: string) => {
      if (String(url).includes("/auth/me")) {
        return Promise.resolve(new Response(signedIn ? JSON.stringify({ id: 1, email: "a@b.c" }) : "{}", { status: signedIn ? 200 : 401 }));
      }
      if (String(url).endsWith("/decks")) return Promise.resolve(new Response("[]", { status: signedIn ? 200 : 401 }));
      return Promise.resolve(new Response("{}", { status: 404 }));
    });
    await mount(seed);
    const btn = document.querySelector<HTMLButtonElement>(`button[aria-label="Actions for ${deckName}"]`)!;
    await act(async () => btn.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    return Array.from(document.querySelectorAll(".deck-card-menu-item")).map((n) => n.textContent);
  }

  it("is offered to a signed-in player for a deck not in the planner (#1017)", async () => {
    expect(await menuLabels("Alpha", true)).toContain("Add to planner");
  });

  it("is not offered for a deck already linked to a planner deck (#1017)", async () => {
    const seed = [{ ...SEEDED[0], plannerDeckId: 5 }, SEEDED[1]];
    expect(await menuLabels("Alpha", true, seed)).not.toContain("Add to planner");
  });

  it("is not offered when signed out (#1017)", async () => {
    expect(await menuLabels("Alpha", false)).not.toContain("Add to planner");
  });
});

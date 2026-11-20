// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DeckEditor } from "../board/DeckEditor";
import { DeckConfigurePage } from "./DeckConfigurePage";
import { getSavedDeck, saveDeck, type SavedDeck } from "../decks/storage";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((q: string) => ({
    matches: q.includes("min-width: 1024px"), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  (globalThis as { CSS?: unknown }).CSS = { escape: (v: string) => v, supports: () => false };
  Element.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 404 })));
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
  localStorage.clear();
});

const settle = (ms = 60) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
const click = (el: Element) => act(async () => void el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })));
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}
const chip = (color: string) => host!.querySelector<HTMLInputElement>(`.deck-color-chip[data-color="${color}"] input`)!;
const ticked = () => [...host!.querySelectorAll<HTMLInputElement>(".deck-color-chip input")].filter((i) => i.checked).map((i) => i.closest("label")!.getAttribute("data-color"));
const rows = () => [...host!.querySelectorAll<HTMLElement>(".deck-search-row")];

async function mountEditor(deck: SavedDeck) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<DeckEditor deck={deck} onChange={() => {}} />));
  await settle();
}

const redDeck = (cards: string[]): SavedDeck => ({ id: "d", name: "Red", leaderId: "ST01-001", cards, updatedAt: 0 });

describe("Add cards follows the Leader's colours (#1386)", () => {
  it("starts with the Leader's colours ticked and lists only those, and Clear filters goes back to them (#1386)", async () => {
    await mountEditor(redDeck([]));
    expect(ticked()).toEqual(["red"]);
    expect(rows().length).toBeGreaterThan(10);
    expect(host!.textContent).not.toContain("Not your Leader's colour");
    await click(chip("red"));
    expect(ticked()).toEqual([]);
    await click([...host!.querySelectorAll("button")].find((b) => b.textContent === "Clear filters")!);
    expect(ticked()).toEqual(["red"]);
  });

  it("a card sharing no colour with the Leader shows why Add is disabled, a legal one stays enabled (#1386)", async () => {
    await mountEditor(redDeck([]));
    await click(chip("red"));
    await type(host!.querySelector<HTMLInputElement>('input[type="search"]')!, "EB01-012");
    const green = rows().find((r) => r.textContent!.includes("EB01-012"))!;
    expect(green.textContent).toContain("Not your Leader's colour");
    expect(green.querySelector<HTMLButtonElement>(".deck-search-add")!.disabled).toBe(true);
    await type(host!.querySelector<HTMLInputElement>('input[type="search"]')!, "ST01-006");
    const red = rows().find((r) => r.textContent!.includes("ST01-006"))!;
    expect(red.textContent).not.toContain("Not your Leader's colour");
    expect(red.querySelector<HTMLButtonElement>(".deck-search-add")!.disabled).toBe(false);
  });

  it("says Deck full above the results when 50 cards are in (#1386)", async () => {
    await mountEditor(redDeck(Array(50).fill("ST01-006")));
    expect(host!.textContent).toContain("Deck full");
    expect(rows()[0].querySelector<HTMLButtonElement>(".deck-search-add")!.disabled).toBe(true);
  });
});

async function mountPage(path: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  function Where() {
    return <p id="where">{useLocation().pathname}</p>;
  }
  await act(async () =>
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <Where />
        <Routes>
          <Route path="/decks/:deckId/configure" element={<DeckConfigurePage />} />
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await settle(100);
}
const where = () => host!.querySelector("#where")!.textContent;
const byText = (t: string) => [...host!.querySelectorAll("button")].find((b) => b.textContent!.trim().startsWith(t))!;

describe("deck editor Play (#1386)", () => {
  const seed = () => saveDeck({ id: "p1", name: "Play me", leaderId: "ST01-001", cards: Array(50).fill("ST01-006") });

  it("saves unsaved edits and goes to play (#1386)", async () => {
    seed();
    await mountPage("/decks/p1/configure");
    await click(host!.querySelector('button[aria-label^="Remove one"]')!);
    await click(byText("Play"));
    await settle();
    expect(getSavedDeck("p1")!.cards).toHaveLength(49);
    expect(where()).toBe("/");
  });

  it("stays on the editor when the save fails (#1386)", async () => {
    seed();
    await mountPage("/decks/p1/configure");
    await click(host!.querySelector('button[aria-label^="Remove one"]')!);
    localStorage.clear();
    await click(byText("Play"));
    await settle();
    expect(where()).toBe("/decks/p1/configure");
    expect(host!.textContent).toContain("Deck not found");
  });
});

describe("built-in starter decks (#1386)", () => {
  it("opens a starter deck from a direct link in a fresh browser (#1386)", async () => {
    await mountPage("/decks/test-op17-red/configure");
    expect(where()).toBe("/decks/test-op17-red/configure");
    expect(host!.querySelector<HTMLInputElement>('input[aria-label="Deck name"]')!.value).toContain("OP17");
  });

  it("Save as a copy keeps unsaved edits in a new deck and opens it (#1386)", async () => {
    await mountPage("/decks/test-op17-red/configure");
    const before = getSavedDeck("test-op17-red")!.cards.length;
    await click(host!.querySelector('button[aria-label^="Remove one"]')!);
    await click(byText("Save as a copy"));
    await settle();
    expect(where()).toMatch(/^\/decks\/(?!test-)[^/]+\/configure$/);
    expect(getSavedDeck("test-op17-red")!.cards).toHaveLength(before);
    const copyId = where()!.split("/")[2];
    const copy = getSavedDeck(copyId)!;
    expect(copy.cards).toHaveLength(before - 1);
    expect(copy.name).toMatch(/\(copy\)$/);
  });
});

describe("deck editor Copy deck list (#1386)", () => {
  it("copies the draft including an unsaved change, not the saved deck (#1386)", async () => {
    saveDeck({ id: "c1", name: "Copy me", leaderId: "ST01-001", cards: Array(50).fill("ST01-006") });
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await mountPage("/decks/c1/configure");
    await click(host!.querySelector('button[aria-label^="Remove one"]')!);
    expect(getSavedDeck("c1")!.cards).toHaveLength(50);
    await click(byText("Copy deck list"));
    expect(writeText).toHaveBeenCalledWith("1xST01-001\n49xST01-006");
    expect(host!.querySelector('[role="status"].deck-list-toast')?.textContent).toContain("Copied");
  });
});

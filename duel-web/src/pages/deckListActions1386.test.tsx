// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DeckListPage } from "./DeckListPage";
import { getSavedDeck, listSavedDecks } from "../decks/storage";

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

const SEEDED = [{ id: "d1", name: "Alpha", leaderId: "OP11-041", cards: Array(50).fill("ST01-003"), updatedAt: 3 }];

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

async function openMenu(deckName: string): Promise<string[]> {
  const btn = document.querySelector<HTMLButtonElement>(`button[aria-label="Actions for ${deckName}"]`)!;
  await act(async () => {
    btn.click();
  });
  return Array.from(document.querySelectorAll(".deck-card-menu-item")).map((n) => n.textContent ?? "");
}

async function clickItem(label: string) {
  const item = Array.from(document.querySelectorAll<HTMLButtonElement>(".deck-card-menu-item")).find((b) => b.textContent === label)!;
  await act(async () => {
    item.click();
  });
}

describe("Decks page card actions (#1386)", () => {
  it("a user deck's menu offers copy, duplicate, rename and delete (#1386)", async () => {
    await mount();
    expect(await openMenu("Alpha")).toEqual(["Copy deck list", "Duplicate", "Rename", "Delete"]);
  });

  it("a built-in deck's menu offers only copy and duplicate (#1386)", async () => {
    await mount();
    const builtin = listSavedDecks().find((d) => d.id.startsWith("test-"))!;
    expect(await openMenu(builtin.name)).toEqual(["Copy deck list", "Duplicate"]);
  });

  it("Duplicate adds a second deck named with (copy) to the list (#1386)", async () => {
    await mount();
    await openMenu("Alpha");
    await clickItem("Duplicate");
    const names = Array.from(document.querySelectorAll(".deck-card-name")).map((n) => n.textContent);
    expect(names).toContain("Alpha (copy)");
    expect(document.querySelector('[role="status"]')?.textContent).toContain("Alpha (copy)");
  });

  it("Rename saves the new name, and a blank name is refused with the dialog kept open (#1386)", async () => {
    await mount();
    await openMenu("Alpha");
    await clickItem("Rename");
    const input = document.querySelector<HTMLInputElement>("#deck-rename-input")!;
    const set = (v: string) =>
      act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, v);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    const submit = () =>
      act(async () => {
        input.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
    await set("   ");
    await submit();
    expect(getSavedDeck("d1")?.name).toBe("Alpha");
    expect(document.querySelector("#deck-rename-error")).not.toBeNull();
    await set("Bravo");
    await submit();
    expect(getSavedDeck("d1")?.name).toBe("Bravo");
    expect(document.querySelector("#deck-rename-input")).toBeNull();
  });

  it("Copy deck list writes the deck code to the clipboard and says so (#1386)", async () => {
    await mount();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await openMenu("Alpha");
    await clickItem("Copy deck list");
    expect(writeText).toHaveBeenCalledWith("1xOP11-041\n50xST01-003");
    expect(document.querySelector('[role="status"]')?.textContent).toContain("Copied");
  });

  it("a blocked clipboard opens a readonly box with the list to copy by hand (#1386)", async () => {
    await mount();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("no")) } });
    await openMenu("Alpha");
    await clickItem("Copy deck list");
    const box = document.querySelector<HTMLTextAreaElement>("textarea.deck-copy-text")!;
    expect(box.readOnly).toBe(true);
    expect(box.value).toBe("1xOP11-041\n50xST01-003");
  });
});

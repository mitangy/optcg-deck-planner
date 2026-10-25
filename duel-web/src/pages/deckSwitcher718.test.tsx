// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { SavedDeck } from "../decks/storage";
import { DeckSwitcher } from "./LobbyPage";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // Type-ahead reads each option's text with innerText, which jsdom lacks.
  Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true,
    get() {
      return (this as HTMLElement).textContent;
    },
  });
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 404 })));
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const deck = (id: string, name: string): SavedDeck => ({ id, name, leaderId: "OP01-001", cards: [], updatedAt: 1 }) as SavedDeck;
const DECKS = [deck("d1", "Alpha"), deck("d2", "Bravo"), deck("d3", "Charlie"), deck("d4", "Bronze")];

function Where() {
  return <output id="where">{useLocation().pathname}</output>;
}

function Harness() {
  const [id, setId] = useState("d1");
  const [picks, setPicks] = useState(0);
  return (
    <MemoryRouter initialEntries={["/"]}>
      <Where />
      <output id="picks">{picks}</output>
      <Routes>
        <Route
          path="/"
          element={
            <DeckSwitcher
              decks={DECKS}
              selectedDeck={DECKS.find((d) => d.id === id)!}
              onChoose={(next) => {
                setId(next);
                setPicks((n) => n + 1);
              }}
            />
          }
        />
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>
  );
}

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const trigger = () => document.querySelector<HTMLButtonElement>("button.home-deck")!;
const list = () => document.querySelector<HTMLElement>('[role="listbox"]');
const active = () => document.getElementById(list()!.getAttribute("aria-activedescendant") ?? "");
const activeName = () => active()?.querySelector(".deck-menu-name")?.textContent ?? active()?.textContent;
const where = () => document.getElementById("where")!.textContent;

async function key(k: string) {
  await act(async () => {
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    document.activeElement?.dispatchEvent(new KeyboardEvent("keyup", { key: k, bubbles: true, cancelable: true }));
    await wait();
  });
}

async function mountOpen() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<Harness />));
  trigger().focus();
  await key("ArrowDown");
}

describe("lobby deck switcher on the shared Listbox (#718)", () => {
  it("opens from the keyboard in a portal, named by its trigger, with the chosen deck active and the wrapper marked open (#718)", async () => {
    await mountOpen();
    expect(list()).not.toBeNull();
    expect(host!.contains(list())).toBe(false);
    // Headless UI names the list by the trigger that opened it.
    expect(list()!.getAttribute("aria-labelledby")).toBe(trigger().id);
    expect(activeName()).toBe("Alpha");
    expect(trigger().classList.contains("open")).toBe(true);
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
  });

  it("arrow keys move through the decks and Enter picks one, closes the list and returns focus (#718)", async () => {
    await mountOpen();
    await key("ArrowDown");
    await key("ArrowDown");
    expect(activeName()).toBe("Charlie");
    await key("Enter");
    expect(list()).toBeNull();
    expect(trigger().textContent).toContain("Charlie");
    expect(document.activeElement).toBe(trigger());
  });

  it("typing the start of a deck's name jumps to it (#718)", async () => {
    await mountOpen();
    await key("b");
    await key("r");
    await key("o");
    expect(activeName()).toBe("Bronze");
    await key("Enter");
    expect(trigger().textContent).toContain("Bronze");
  });

  it("Escape closes it without changing the deck and focus returns to the trigger (#718)", async () => {
    await mountOpen();
    await key("ArrowDown");
    await key("Escape");
    expect(list()).toBeNull();
    expect(trigger().textContent).toContain("Alpha");
    expect(document.activeElement).toBe(trigger());
  });

  it("the footer rows are reached with the arrow keys and Enter on them goes to the deck pages (#718)", async () => {
    await mountOpen();
    await key("End");
    expect(active()?.textContent).toContain("Manage decks");
    await key("ArrowUp");
    expect(active()?.textContent).toContain("New deck");
    await key("Enter");
    expect(where()).toBe("/decks/new");
    expect(list()).toBeNull();
  });

  it("Edit on a row opens that deck's editor and does not pick the deck (#718)", async () => {
    await mountOpen();
    await act(async () => {
      document.querySelector<HTMLElement>('button[aria-label="Edit Bravo"]')!.click();
      await wait();
    });
    expect(where()).toBe("/decks/d2/configure");
    expect(document.getElementById("picks")!.textContent).toBe("0");
  });

  it("Enter on the footer's Manage decks row goes to the deck list without picking a deck (#718)", async () => {
    await mountOpen();
    await key("End");
    await key("Enter");
    expect(where()).toBe("/decks");
    expect(document.getElementById("picks")!.textContent).toBe("0");
  });
});

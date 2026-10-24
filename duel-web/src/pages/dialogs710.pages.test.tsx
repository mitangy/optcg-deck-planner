// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DemoPage } from "./DemoPage";
import { DeckConfigurePage } from "./DeckConfigurePage";
import { LobbyPage } from "./LobbyPage";
import { DuelSessionProvider } from "../state/DuelSession";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
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
  root = null;
  host = null;
  localStorage.clear();
});

async function mountAt(path: string, el: React.ReactNode, route: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={el} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 100));
  });
}

const modal = () => document.querySelector<HTMLElement>('[aria-modal="true"]');
const buttonByText = (re: RegExp) => Array.from(document.querySelectorAll("button")).find((b) => re.test(b.textContent ?? ""))!;

async function press(key: string) {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 40));
  });
}

async function click(el: Element) {
  await act(async () => {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
    }
    await new Promise((r) => setTimeout(r, 60));
  });
}

describe("Play-mode sheet on the shared Dialog", () => {
  it("opens as a modal named Play with focus inside, and Escape closes it and returns focus to Play (#710)", async () => {
    await mountAt("/", <DuelSessionProvider><LobbyPage /></DuelSessionProvider>, "/");
    const play = buttonByText(/^PlayChoose a mode/);
    play.focus();
    await click(play);
    expect(modal()!.getAttribute("aria-label")).toBe("Play");
    expect(modal()!.contains(document.activeElement)).toBe(true);
    await press("Escape");
    expect(modal()).toBeNull();
    expect(document.activeElement).toBe(play);
  });

  it("a click on the backdrop closes it, a click inside the sheet does not (#710)", async () => {
    await mountAt("/", <DuelSessionProvider><LobbyPage /></DuelSessionProvider>, "/");
    await click(buttonByText(/^PlayChoose a mode/));
    await click(modal()!.querySelector(".sheet-head")!);
    expect(modal()).not.toBeNull();
    await click(modal()!);
    expect(modal()).toBeNull();
  });
});

describe("Leave-page confirm on the shared Dialog", () => {
  async function openLeaveConfirm() {
    localStorage.setItem(
      "optcg.duel.savedDecks.v1",
      JSON.stringify([{ id: "x", name: "Red", leaderId: "ST01-001", cards: Array(50).fill("ST01-006"), updatedAt: 1 }]),
    );
    await mountAt("/decks/x/configure", <DeckConfigurePage />, "/decks/:deckId/configure");
    await click(document.querySelector('button[aria-label^="Remove one"]')!);
    await click(document.querySelector('a[href="/decks"]')!);
  }

  it("opens as a modal named by its question, Save has focus, and Escape keeps editing (#710)", async () => {
    await openLeaveConfirm();
    const d = modal()!;
    expect(d.getAttribute("aria-labelledby")).toBeTruthy();
    expect(d.textContent).toContain("Save changes to Red?");
    expect(document.activeElement?.textContent).toBe("Save");
    await press("Escape");
    expect(modal()).toBeNull();
    expect(document.body.textContent).toContain("Leader Monkey.D.Luffy");
  });

  it("a click outside the dialog keeps editing, a click inside does not (#710)", async () => {
    await openLeaveConfirm();
    await click(modal()!.querySelector(".leave-dialog p")!);
    expect(modal()).not.toBeNull();
    await click(modal()!);
    expect(modal()).toBeNull();
  });
});

describe("Match result on the shared Dialog", () => {
  async function openResult() {
    window.history.pushState({}, "", "/demo?over");
    await mountAt("/demo?over", <DemoPage />, "/demo");
  }

  it("is a modal named by its headline that Escape and an outside click leave open (#710)", async () => {
    await openResult();
    const d = modal()!;
    expect(d.className).toContain("modal-backdrop");
    expect(d.getAttribute("aria-labelledby")).toBeTruthy();
    expect(d.textContent).toContain("Match over");
    expect(modal()!.contains(document.activeElement)).toBe(true);
    await press("Escape");
    expect(modal()).not.toBeNull();
    await click(modal()!);
    expect(modal()).not.toBeNull();
  });

  it("View board closes it and shows the Show result pill (#710)", async () => {
    await openResult();
    await click(buttonByText(/^View board$/));
    expect(modal()).toBeNull();
    expect(document.body.textContent).toContain("Show result");
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { DeckStatsDock } from "./DeckStats";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const wait = () => new Promise((r) => setTimeout(r, 40));
const pill = () => document.querySelector<HTMLButtonElement>(".stats-pill")!;
const backdrop = () => document.querySelector<HTMLElement>(".stats-sheet-backdrop");
const sheet = () => document.querySelector<HTMLElement>(".stats-sheet");

async function press(key: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
    await wait();
  });
}

async function click(el: Element) {
  await act(async () => {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
    }
    await wait();
  });
}

/** Narrow screen (jsdom has no matchMedia), so the dock is the floating Stats pill and a bottom sheet. */
async function openSheet() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<DeckStatsDock cards={[]} leaderId={null} />));
  pill().focus();
  await click(pill());
}

describe("deck stats sheet on the shared Dialog", () => {
  it("opens as a named modal with focus moved into it (#714)", async () => {
    await openSheet();
    expect(backdrop()!.getAttribute("role")).toBe("dialog");
    expect(backdrop()!.getAttribute("aria-modal")).toBe("true");
    expect(backdrop()!.getAttribute("aria-label")).toBe("Deck stats");
    expect(backdrop()!.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(pill());
  });

  it("Tab off the last control wraps to the first, and Shift+Tab off the first wraps to the last (#714)", async () => {
    await openSheet();
    const items = Array.from(sheet()!.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"));
    const first = items[0];
    const last = items[items.length - 1];
    expect(items.length).toBeGreaterThan(1);
    // jsdom has no native Tab. In a browser, Tab past the end lands on Headless UI's hidden focus guard.
    const guards = () => Array.from(document.querySelectorAll<HTMLElement>("[data-headlessui-focus-guard]"));
    expect(guards().length).toBeGreaterThanOrEqual(2);
    last.focus();
    await act(async () => {
      guards()[guards().length - 1].focus();
      await wait();
    });
    expect(document.activeElement).toBe(first);
    await press("Tab", { shiftKey: true });
    await act(async () => {
      guards()[0].focus();
      await wait();
    });
    expect(document.activeElement).toBe(last);
    expect(document.activeElement).not.toBe(pill());
  });

  it("Escape closes it and focus returns to the Stats pill (#714)", async () => {
    await openSheet();
    await press("Escape");
    expect(backdrop()).toBeNull();
    expect(document.activeElement).toBe(pill());
  });

  it("a click beside the sheet closes it, a click inside does not (#714)", async () => {
    await openSheet();
    await click(sheet()!.querySelector("h2")!);
    expect(backdrop()).not.toBeNull();
    await click(backdrop()!);
    expect(backdrop()).toBeNull();
  });

  it("the Close button closes it (#714)", async () => {
    await openSheet();
    await click(sheet()!.querySelector("button.stats-dock-collapse")!);
    expect(backdrop()).toBeNull();
    expect(pill().getAttribute("aria-expanded")).toBe("false");
  });

  it("locks page scroll while open and releases it on close (#714)", async () => {
    await openSheet();
    expect(getComputedStyle(document.documentElement).overflow).toBe("hidden");
    await press("Escape");
    expect(getComputedStyle(document.documentElement).overflow).not.toBe("hidden");
  });
});

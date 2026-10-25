// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PlacedCitation } from "./citations";
import { CitedAnswer } from "./Sources";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
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

const TEXT = "Lead with Zoro. Then hold the blocker back.";
const CITES: PlacedCitation[] = [
  { at: 14, source: "card:OP01-001", title: "Zoro (OP01-001)", cited_text: "cost 3" },
  { at: 43, source: "rule:6-5-3", title: "Rules §6-5-3 Blocker", cited_text: "Blocker rests" },
];

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<CitedAnswer text={TEXT} citations={CITES} />));
}

async function click(el: Element) {
  await act(async () => {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
    }
    await wait();
  });
}

async function key(k: string) {
  await act(async () => {
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    document.activeElement?.dispatchEvent(new KeyboardEvent("keyup", { key: k, bubbles: true, cancelable: true }));
    await wait();
  });
}

const mark = (n: number) => document.querySelector<HTMLButtonElement>(`button.lp-cite[aria-label^="Source ${n}:"]`)!;
const pop = () => document.querySelector<HTMLElement>(".lp-pop");

describe("source popover on the shared Popover (#718)", () => {
  it("a marker opens its source in a portal, a second press closes it (#718)", async () => {
    await mount();
    expect(pop()).toBeNull();
    await click(mark(1));
    expect(pop()).not.toBeNull();
    expect(host!.contains(pop())).toBe(false);
    expect(pop()!.getAttribute("aria-label")).toBe("Source 1: Zoro (OP01-001)");
    expect(pop()!.textContent).toContain("cost 3");
    expect(mark(1).getAttribute("aria-expanded")).toBe("true");
    // Headless UI marks the open button, and logPose.css styles `.lp-cite[data-open]`.
    expect(mark(1).hasAttribute("data-open")).toBe(true);
    await click(mark(1));
    expect(pop()).toBeNull();
    expect(mark(1).hasAttribute("data-open")).toBe(false);
  });

  it("Escape closes it and focus returns to the marker (#718)", async () => {
    await mount();
    await click(mark(2));
    expect(pop()!.getAttribute("aria-label")).toContain("Source 2");
    await key("Escape");
    expect(pop()).toBeNull();
    expect(document.activeElement).toBe(mark(2));
  });

  it("the close button and a click outside both close it, and another marker replaces it (#718)", async () => {
    await mount();
    await click(mark(1));
    await click(pop()!.querySelector('button[aria-label="Close source"]')!);
    expect(pop()).toBeNull();
    await click(mark(1));
    await click(mark(2));
    expect([...document.querySelectorAll(".lp-pop")].map((p) => p.getAttribute("aria-label"))).toEqual(["Source 2: Rules §6-5-3 Blocker"]);
    await click(document.body);
    expect(pop()).toBeNull();
  });
});

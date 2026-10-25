// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { DeckHint } from "../deckHints";
import { DeckHintsTray, type HintsState } from "./DeckHints";

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

const HINTS: DeckHint[] = [
  { id: "count", tier: "rule", title: "14 of 50 cards", detail: "A legal deck has exactly 50 cards.", cardIds: ["OP01-001"] },
  { id: "curve", tier: "shape", title: "Top-heavy curve", detail: "Too many 7-drops." },
];

function state(over: Partial<HintsState> = {}): HintsState {
  return { atlas: { "OP01-001": { n: "Zoro", cost: 3 } } as never, loading: false, visible: HINTS, dismissed: [], dismiss: vi.fn(), restore: vi.fn(), ...over };
}

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

async function mount(hints: HintsState) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<DeckHintsTray hints={hints} />));
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

const chip = (id: string) => document.querySelector<HTMLButtonElement>(`[data-hint-id="${id}"]`)!;
const pop = () => document.querySelector<HTMLElement>(".dh-pop");

describe("build hint popover on the shared Popover (#718)", () => {
  it("a chip opens its hint in a portal with the tier class and listed cards, a second press closes it (#718)", async () => {
    await mount(state());
    expect(pop()).toBeNull();
    await click(chip("count"));
    expect(pop()).not.toBeNull();
    expect(host!.contains(pop())).toBe(false);
    expect(pop()!.getAttribute("aria-label")).toBe("14 of 50 cards");
    expect(pop()!.classList.contains("dh-rule")).toBe(true);
    expect(pop()!.textContent).toContain("Zoro");
    expect(chip("count").getAttribute("aria-expanded")).toBe("true");
    await click(chip("count"));
    expect(pop()).toBeNull();
  });

  it("Escape closes it and focus returns to the chip (#718)", async () => {
    await mount(state());
    await click(chip("count"));
    await key("Escape");
    expect(pop()).toBeNull();
    expect(document.activeElement).toBe(chip("count"));
  });

  it("a click outside closes it, and opening another chip puts the first one away (#718)", async () => {
    await mount(state());
    await click(chip("count"));
    await click(chip("curve"));
    expect([...document.querySelectorAll(".dh-pop")].map((p) => p.getAttribute("aria-label"))).toEqual(["Top-heavy curve"]);
    await click(document.body);
    expect(pop()).toBeNull();
  });

  it("Dismiss acts without closing the popover by itself, and Why? closes it before asking (#718)", async () => {
    const onAsk = vi.fn();
    const hints = state({ onAsk });
    await mount(hints);
    await click(chip("count"));
    await click([...pop()!.querySelectorAll("button")].find((b) => b.textContent === "Dismiss")!);
    expect(hints.dismiss).toHaveBeenCalledWith("count");
    await click([...pop()!.querySelectorAll("button")].find((b) => b.textContent === "Why? Ask Log Pose")!);
    expect(onAsk).toHaveBeenCalledWith(HINTS[0]);
    expect(pop()).toBeNull();
  });
});

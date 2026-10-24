// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Popover, PopoverButton, PopoverPanel } from "./Popover";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // The anchored panel measures itself with this; jsdom has none.
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

function Harness() {
  const [ticked, setTicked] = useState<string[]>([]);
  const toggle = (k: string) => setTicked((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]));
  return (
    <div id="host">
      <Popover>
        <PopoverButton id="btn">Sort</PopoverButton>
        <PopoverPanel aria-label="Sort order" role="dialog">
          <label>
            <input type="checkbox" id="a" checked={ticked.includes("a")} onChange={() => toggle("a")} /> Price
          </label>
          <label>
            <input type="checkbox" id="b" checked={ticked.includes("b")} onChange={() => toggle("b")} /> Name
          </label>
        </PopoverPanel>
      </Popover>
      <button id="outside" type="button">
        Elsewhere
      </button>
    </div>
  );
}

const btn = () => document.getElementById("btn") as HTMLButtonElement;
const panel = () => document.querySelector<HTMLElement>('[role="dialog"]');
const wait = () => new Promise((r) => setTimeout(r, 40));

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<Harness />));
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

describe("Popover", () => {
  it("the button opens the panel in a portal and a second press closes it, so opening cannot move the trigger (#718)", async () => {
    await mount();
    expect(panel()).toBeNull();
    await click(btn());
    expect(panel()).not.toBeNull();
    expect(document.getElementById("host")!.contains(panel())).toBe(false);
    expect(btn().getAttribute("aria-expanded")).toBe("true");
    await click(btn());
    expect(panel()).toBeNull();
    expect(btn().getAttribute("aria-expanded")).toBe("false");
  });

  it("Escape closes it and focus returns to the button (#718)", async () => {
    await mount();
    await click(btn());
    panel()!.querySelector<HTMLInputElement>("#a")!.focus();
    await key("Escape");
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(btn());
  });

  it("a click outside the panel closes it (#718)", async () => {
    await mount();
    await click(btn());
    expect(panel()).not.toBeNull();
    await click(document.getElementById("outside")!);
    expect(panel()).toBeNull();
  });

  it("the panel stays open while a checkbox inside it is toggled (#718)", async () => {
    await mount();
    await click(btn());
    const box = () => panel()!.querySelector<HTMLInputElement>("#a")!;
    await click(box());
    expect(box().checked).toBe(true);
    expect(panel()).not.toBeNull();
    await click(panel()!.querySelector("#b")!);
    await click(box());
    expect(box().checked).toBe(false);
    expect(panel()!.querySelector<HTMLInputElement>("#b")!.checked).toBe(true);
    expect(panel()).not.toBeNull();
  });
});

// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Listbox, ListboxButton, ListboxList, ListboxOption } from "./Listbox";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // Type-ahead reads each option's text with innerText, which jsdom lacks.
  Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true,
    get() {
      return (this as HTMLElement).textContent;
    },
  });
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

const DECKS = ["Alpha", "Bravo", "Charlie", "Bronze"];

function Harness() {
  const [value, setValue] = useState("Alpha");
  return (
    <div id="host">
      <Listbox value={value} onChange={setValue}>
        <ListboxButton id="btn">{value}</ListboxButton>
        <ListboxList aria-label="Choose a deck">
          {DECKS.map((d) => (
            <ListboxOption key={d} value={d}>
              {d}
            </ListboxOption>
          ))}
        </ListboxList>
      </Listbox>
    </div>
  );
}

const btn = () => document.getElementById("btn") as HTMLButtonElement;
const list = () => document.querySelector<HTMLElement>('[role="listbox"]');
const active = () => document.getElementById(list()!.getAttribute("aria-activedescendant") ?? "")?.textContent;
const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

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
  btn().focus();
  await key("ArrowDown");
}

describe("Listbox", () => {
  it("opens from the keyboard in a portal with the chosen option active (#718)", async () => {
    await mountOpen();
    expect(list()).not.toBeNull();
    expect(document.getElementById("host")!.contains(list())).toBe(false);
    expect(active()).toBe("Alpha");
  });

  it("arrow keys move the active option and Enter picks it and closes the list (#718)", async () => {
    await mountOpen();
    await key("ArrowDown");
    await key("ArrowDown");
    expect(active()).toBe("Charlie");
    await key("Enter");
    expect(list()).toBeNull();
    expect(btn().textContent).toBe("Charlie");
    expect(document.activeElement).toBe(btn());
  });

  it("typing jumps to the option that starts with those letters (#718)", async () => {
    await mountOpen();
    await key("c");
    expect(active()).toBe("Charlie");
    await wait(400);
    await key("b");
    await key("r");
    await key("o");
    expect(active()).toBe("Bronze");
    await key("Enter");
    expect(btn().textContent).toBe("Bronze");
  });

  it("Enter on the button opens the list, which a bare Headless UI Listbox leaves to form submission (#718)", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root!.render(<Harness />));
    btn().focus();
    await key("Enter");
    expect(list()).not.toBeNull();
    expect(active()).toBe("Alpha");
  });

  it("Escape closes it without changing the choice and focus returns to the button (#718)", async () => {
    await mountOpen();
    await key("ArrowDown");
    await key("Escape");
    expect(list()).toBeNull();
    expect(btn().textContent).toBe("Alpha");
    expect(document.activeElement).toBe(btn());
  });
});

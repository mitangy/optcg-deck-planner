// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Menu, MenuButton, MenuItem, MenuList } from "./Menu";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // The anchored list measures itself with this; jsdom has none.
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
  const [picked, setPicked] = useState("none");
  const [copies, setCopies] = useState(0);
  return (
    <div id="host">
      <Menu>
        <MenuButton id="btn">Actions</MenuButton>
        <MenuList>
          <MenuItem>
            <button type="button" onClick={() => setPicked("rename")}>
              Rename
            </button>
          </MenuItem>
          <MenuItem>
            <button type="button" onClick={() => setPicked("delete")}>
              Delete
            </button>
          </MenuItem>
          <MenuItem keepOpen>
            <button type="button" onClick={() => setCopies((n) => n + 1)}>
              Copy link
            </button>
          </MenuItem>
        </MenuList>
      </Menu>
      <output id="picked">{picked}</output>
      <output id="copies">{copies}</output>
    </div>
  );
}

const btn = () => document.getElementById("btn") as HTMLButtonElement;
const list = () => document.querySelector<HTMLElement>('[role="menu"]');
const wait = () => new Promise((r) => setTimeout(r, 40));

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

describe("Menu", () => {
  it("opens from the keyboard in a portal, so opening cannot move the trigger or its neighbours (#708)", async () => {
    await mountOpen();
    expect(list()).not.toBeNull();
    expect(document.getElementById("host")!.contains(list())).toBe(false);
  });

  it("arrow keys move through the items and Enter picks one (#708)", async () => {
    await mountOpen();
    await key("ArrowDown");
    await key("Enter");
    expect(document.getElementById("picked")!.textContent).toBe("delete");
    expect(list()).toBeNull();
  });

  it("Escape closes it and focus returns to the button (#708)", async () => {
    await mountOpen();
    await key("Escape");
    expect(list()).toBeNull();
    expect(document.activeElement).toBe(btn());
  });
});

describe("MenuItem keepOpen (#715)", () => {
  const copies = () => document.getElementById("copies")!.textContent;

  it("a click picks a keepOpen item and leaves the menu open; a plain item closes it (#715)", async () => {
    await mountOpen();
    await act(async () => {
      document.querySelector<HTMLElement>("[data-keep-open]")!.click();
      await wait();
    });
    expect(copies()).toBe("1");
    expect(list()).not.toBeNull();
    await act(async () => {
      [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')][0]!.click();
      await wait();
    });
    expect(list()).toBeNull();
  });

  it("Enter on a keepOpen item picks it once and leaves the menu open (#715)", async () => {
    await mountOpen();
    await key("End");
    await key("Enter");
    expect(copies()).toBe("1");
    expect(list()).not.toBeNull();
    await key("Escape");
    expect(list()).toBeNull();
    expect(document.activeElement).toBe(btn());
  });
});

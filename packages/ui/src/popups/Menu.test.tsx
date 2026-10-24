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
        </MenuList>
      </Menu>
      <output id="picked">{picked}</output>
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
  it("opens from the keyboard in a portal, so opening cannot move the trigger or its neighbours (#700-2)", async () => {
    await mountOpen();
    expect(list()).not.toBeNull();
    expect(document.getElementById("host")!.contains(list())).toBe(false);
  });

  it("arrow keys move through the items and Enter picks one (#700-2)", async () => {
    await mountOpen();
    await key("ArrowDown");
    await key("Enter");
    expect(document.getElementById("picked")!.textContent).toBe("delete");
    expect(list()).toBeNull();
  });

  it("Escape closes it and focus returns to the button (#700-2)", async () => {
    await mountOpen();
    await key("Escape");
    expect(list()).toBeNull();
    expect(document.activeElement).toBe(btn());
  });
});

// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { MenuItem } from "@optcg/ui/popups";
import { HeadMenu } from "./HeadPopover";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
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

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

function Harness() {
  const [picked, setPicked] = useState("none");
  return (
    <div id="head">
      <HeadMenu label="More" className="btn quiet">
        <MenuItem>
          <button type="button" onClick={() => setPicked("hide")}>
            Hide from friends
          </button>
        </MenuItem>
        <MenuItem disabled>
          <button type="button" onClick={() => setPicked("main")}>
            Set as Main deck
          </button>
        </MenuItem>
        <MenuItem>
          <button type="button" className="danger" onClick={() => setPicked("reset")}>
            Reset owned counts
          </button>
        </MenuItem>
      </HeadMenu>
      <output id="picked">{picked}</output>
    </div>
  );
}

async function mountOpen() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<Harness />));
  trigger().focus();
  await press("ArrowDown");
}

async function press(key: string) {
  await act(async () => {
    const el = document.activeElement ?? document.body;
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }));
    await wait();
  });
}

const trigger = () => document.querySelector<HTMLButtonElement>("button.head-popover-btn")!;
const menu = () => document.querySelector<HTMLElement>('[role="menu"]');
const rows = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
const active = () => document.getElementById(menu()!.getAttribute("aria-activedescendant") ?? "");
const picked = () => document.getElementById("picked")!.textContent;

describe("deck More menu on the shared Menu (#715)", () => {
  it("opens in a portal with the chevron wrapper marked open, named by its button (#715)", async () => {
    await mountOpen();
    expect(menu()).not.toBeNull();
    expect(host!.contains(menu())).toBe(false);
    expect(menu()!.getAttribute("aria-labelledby")).toBe(trigger().id);
    expect(menu()!.className).toContain("head-popover-panel");
    expect(document.querySelector(".head-popover")!.classList.contains("open")).toBe(true);
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
  });

  it("arrow keys step through the rows and skip a disabled one (#715)", async () => {
    await mountOpen();
    expect(active()).toBe(rows()[0]);
    await press("ArrowDown");
    expect(active()).toBe(rows()[2]);
    await press("ArrowUp");
    expect(active()).toBe(rows()[0]);
  });

  it("Enter picks the active row and closes the menu (#715)", async () => {
    await mountOpen();
    await press("ArrowDown");
    await press("Enter");
    expect(picked()).toBe("reset");
    expect(menu()).toBeNull();
  });

  it("clicking a disabled row does nothing and leaves the menu open (#715)", async () => {
    await mountOpen();
    await act(async () => {
      rows()[1]!.click();
      await wait();
    });
    expect(picked()).toBe("none");
    expect(menu()).not.toBeNull();
  });

  it("Escape closes it and focus returns to the More button (#715)", async () => {
    await mountOpen();
    await press("Escape");
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(document.querySelector(".head-popover")!.classList.contains("open")).toBe(false);
  });
});

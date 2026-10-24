// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Dialog } from "./Dialog";

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

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" id="trigger" onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} className="my-backdrop" panelClassName="my-panel" label="Example">
        <p id="inside">Inside</p>
        <button type="button" id="first">
          First
        </button>
      </Dialog>
    </div>
  );
}

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<Harness />));
}

const trigger = () => document.getElementById("trigger") as HTMLButtonElement;
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');

async function open() {
  trigger().focus();
  await act(async () => {
    trigger().click();
    // Headless UI moves focus in after paint.
    await new Promise((r) => setTimeout(r, 30));
  });
}

async function press(key: string) {
  await act(async () => {
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    // Focus goes back to the trigger after the dialog has unmounted.
    await new Promise((r) => setTimeout(r, 30));
  });
}

async function click(el: Element) {
  await act(async () => {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
    }
    await new Promise((r) => setTimeout(r, 30));
  });
}

describe("Dialog", () => {
  it("opens as a named modal on the backdrop class, outside the host tree (#708)", async () => {
    mount();
    expect(dialog()).toBeNull();
    await open();
    const d = dialog()!;
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(d.getAttribute("aria-label")).toBe("Example");
    expect(d.classList.contains("my-backdrop")).toBe(true);
    expect(d.querySelector(".my-panel #inside")).not.toBeNull();
    expect(host!.contains(d)).toBe(false);
  });

  it("moves focus into the dialog on open and back to the trigger on close (#708)", async () => {
    mount();
    await open();
    expect(dialog()!.contains(document.activeElement)).toBe(true);
    await press("Escape");
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("Escape closes it (#708)", async () => {
    mount();
    await open();
    await press("Escape");
    expect(dialog()).toBeNull();
  });

  it("a click outside the panel closes it, a click inside does not (#708)", async () => {
    mount();
    await open();
    await click(document.getElementById("inside")!);
    expect(dialog()).not.toBeNull();
    await click(dialog()!);
    expect(dialog()).toBeNull();
  });
});

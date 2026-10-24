// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

function Harness({ transition }: { transition?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" id="trigger" onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} className="my-backdrop" panelClassName="my-panel" label="Example" transition={transition}>
        <p id="inside">Inside</p>
        <button type="button" id="first">
          First
        </button>
      </Dialog>
    </div>
  );
}

function mount(transition?: boolean) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<Harness transition={transition} />));
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

  it("a click outside the panel closes it, a click inside does not (#708)", async () => {
    mount();
    await open();
    await click(document.getElementById("inside")!);
    expect(dialog()).not.toBeNull();
    await click(dialog()!);
    expect(dialog()).toBeNull();
  });

  describe("transition (#722)", () => {
    // jsdom runs no CSS transitions, so stand in for one: every element reports a running CSSTransition
    // that settles when the test says so, like the end of `transition: transform 200ms`.
    let finish: () => void;
    const g = globalThis as { CSSTransition?: unknown };
    const proto = Element.prototype as { getAnimations?: () => unknown[] };
    let savedGetAnimations: (() => unknown[]) | undefined;
    beforeEach(() => {
      class FakeTransition {
        finished: Promise<unknown>;
        constructor(settle: Promise<unknown>) {
          this.finished = settle;
        }
      }
      let pending: Array<() => void> = [];
      finish = () => {
        pending.forEach((release) => release());
        pending = [];
      };
      g.CSSTransition = FakeTransition;
      savedGetAnimations = proto.getAnimations;
      proto.getAnimations = () => [new FakeTransition(new Promise<void>((r) => pending.push(r)))];
    });
    afterEach(() => {
      delete g.CSSTransition;
      proto.getAnimations = savedGetAnimations;
    });

    const panel = () => document.querySelector<HTMLElement>(".my-panel");
    const settle = () =>
      act(async () => {
        // The transition is read a couple of frames after the state flips, so settle on every tick for a while.
        for (let i = 0; i < 8; i++) {
          finish();
          await new Promise((r) => setTimeout(r, 20));
        }
      });

    it("keeps the panel mounted, marked data-closed, while it leaves, then unmounts (#722)", async () => {
      mount(true);
      await open();
      await settle();
      expect(panel()).not.toBeNull();
      expect(panel()!.hasAttribute("data-closed")).toBe(false);

      await press("Escape");
      expect(dialog()).not.toBeNull();
      expect(panel()!.hasAttribute("data-leave")).toBe(true);
      // The hidden state lands a frame after the leave starts; the CSS transition runs between the two.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });
      expect(dialog()).not.toBeNull();
      expect(panel()!.hasAttribute("data-closed")).toBe(true);

      await settle();
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(trigger());
    });

    it("without transition the panel unmounts at once (#722)", async () => {
      mount();
      await open();
      await press("Escape");
      expect(dialog()).toBeNull();
    });
  });
});

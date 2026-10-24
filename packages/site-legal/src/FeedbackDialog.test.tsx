// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { FeedbackDialog } from "./FeedbackDialog";
import type { FeedbackPayload } from "./feedback";

let root: Root | null = null;
let host: HTMLElement | null = null;
let sent: FeedbackPayload[] = [];
let finishSend: (() => void) | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  sent = [];
  finishSend = null;
});

const wait = () => new Promise((r) => setTimeout(r, 40));

/** A page with an opener button; `submit` stays pending until the test calls `finishSend`. */
function Page() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" id="opener" onClick={() => setOpen(true)}>
        Send feedback
      </button>
      {open ? (
        <FeedbackDialog
          title="Send feedback"
          submit={(payload) =>
            new Promise<void>((resolve) => {
              sent.push(payload);
              finishSend = resolve;
            })
          }
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

const opener = () => document.getElementById("opener") as HTMLButtonElement;
const dialog = () => document.querySelector<HTMLElement>(".feedback-backdrop");
const textBox = () => document.querySelector<HTMLTextAreaElement>(".feedback-text")!;
const buttons = () => Array.from(dialog()!.querySelectorAll<HTMLElement>("button:not([disabled]), textarea"));

async function openDialog() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<Page />));
  opener().focus();
  await act(async () => {
    opener().click();
    await wait();
  });
}

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

async function type(value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(textBox(), value);
    textBox().dispatchEvent(new Event("input", { bubbles: true }));
    await wait();
  });
}

describe("FeedbackDialog on the shared Dialog", () => {
  it("opens as a modal named by its title with the cursor in the text box (#714)", async () => {
    await openDialog();
    const el = dialog()!;
    expect(el.getAttribute("role")).toBe("dialog");
    expect(el.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(el.getAttribute("aria-labelledby")!)!.textContent).toBe("Send feedback");
    expect(document.activeElement).toBe(textBox());
  });

  it("Tab off the last control wraps to the first, and Shift+Tab off the first to the last (#714)", async () => {
    await openDialog();
    const items = buttons();
    const first = items[0];
    const last = items[items.length - 1];
    // jsdom has no native Tab. In a browser, Tab past the end lands on Headless UI's hidden focus guard
    // (the focusable sentinel around the panel); focusing it is the same step.
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
    expect(document.activeElement).not.toBe(opener());
  });

  it("Escape closes it and focus returns to the button that opened it (#714)", async () => {
    await openDialog();
    await press("Escape");
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener());
  });

  it("a click on the backdrop closes it, a click inside the card does not (#714)", async () => {
    await openDialog();
    await click(document.querySelector(".feedback-card")!);
    expect(dialog()).not.toBeNull();
    await click(dialog()!);
    expect(dialog()).toBeNull();
  });

  it("neither Escape nor the backdrop closes it while the message is sending (#714)", async () => {
    await openDialog();
    await type("The end turn button is hard to find.");
    await click(dialog()!.querySelector("button[type=submit]")!);
    expect(sent).toHaveLength(1);
    expect(dialog()!.querySelector("button[type=submit]")!.textContent).toBe("Sending…");
    await press("Escape");
    expect(dialog()).not.toBeNull();
    await click(dialog()!);
    expect(dialog()).not.toBeNull();
    await act(async () => {
      finishSend!();
      await wait();
    });
    expect(dialog()!.textContent).toContain("Thanks, we got it.");
  });

  it("focus moves to Close once the message is sent, and Escape then closes it (#714)", async () => {
    await openDialog();
    await type("The end turn button is hard to find.");
    await click(dialog()!.querySelector("button[type=submit]")!);
    await act(async () => {
      finishSend!();
      await wait();
    });
    expect(document.activeElement!.textContent).toBe("Close");
    await press("Escape");
    expect(dialog()).toBeNull();
  });
});

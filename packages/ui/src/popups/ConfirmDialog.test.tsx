// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { useConfirm } from "./ConfirmDialog";

let root: Root | null = null;
let host: HTMLElement | null = null;
let ran: string[] = [];

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  ran = [];
});

function Harness() {
  const { confirm, confirmDialog } = useConfirm();
  const [, force] = useState(0);
  return (
    <div>
      <button
        type="button"
        id="trigger"
        onClick={async () => {
          if (await confirm({ title: "Delete deck?", message: "First.\n\nSecond.", confirmLabel: "Delete" })) ran.push("deleted");
          force((n) => n + 1);
        }}
      >
        Delete
      </button>
      {confirmDialog}
    </div>
  );
}

const trigger = () => document.getElementById("trigger") as HTMLButtonElement;
const dialog = () => document.querySelector<HTMLElement>('[role="alertdialog"]');
const button = (name: string) => Array.from(dialog()!.querySelectorAll("button")).find((b) => b.textContent === name)!;
const tick = () => new Promise((r) => setTimeout(r, 30));

async function open() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<Harness />));
  trigger().focus();
  await act(async () => {
    trigger().click();
    await tick();
  });
}

async function click(el: Element) {
  await act(async () => {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
    }
    await tick();
  });
}

describe("useConfirm", () => {
  it("opens with Cancel focused and the danger style on the confirm button (#1342)", async () => {
    await open();
    expect(document.activeElement).toBe(button("Cancel"));
    expect(button("Delete").classList.contains("danger")).toBe(true);
    expect(dialog()!.querySelectorAll(".ui-confirm-message")).toHaveLength(2);
  });

  it("Cancel does nothing and hands focus back to the trigger (#1342)", async () => {
    await open();
    await click(button("Cancel"));
    expect(dialog()).toBeNull();
    expect(ran).toEqual([]);
    expect(document.activeElement).toBe(trigger());
  });

  it("Escape cancels without running the action (#1342)", async () => {
    await open();
    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      await tick();
    });
    expect(dialog()).toBeNull();
    expect(ran).toEqual([]);
  });

  it("the confirm button runs the action once (#1342)", async () => {
    await open();
    await click(button("Delete"));
    expect(dialog()).toBeNull();
    expect(ran).toEqual(["deleted"]);
  });
});

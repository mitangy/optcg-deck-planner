// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { TrashViewer } from "./TrashViewer";

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

function Pile() {
  const [open, setOpen] = useState(false);
  return (
    <div className="board-root">
      <button type="button" id="pile" onClick={() => setOpen(true)}>
        Trash
      </button>
      {open ? <TrashViewer title="Your trash" cards={["ST01-003", "ST01-014"]} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

const wait = () => new Promise((r) => setTimeout(r, 40));
const viewer = () => document.querySelector<HTMLElement>(".trash-viewer-backdrop");
const inspect = () => document.querySelector<HTMLElement>(".card-inspect-backdrop");

async function mountOpen() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<Pile />));
  const pile = document.getElementById("pile") as HTMLButtonElement;
  pile.focus();
  await act(async () => {
    pile.click();
    await wait();
  });
}

async function escape() {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
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

async function openCard() {
  await click(document.querySelector(".trash-viewer-grid .card-tile")!);
}

describe("TrashViewer as a dialog", () => {
  it("opens as a modal named by its title, focus moves in, and Escape closes it and gives focus back (#700-2)", async () => {
    await mountOpen();
    expect(viewer()!.getAttribute("role")).toBe("dialog");
    expect(viewer()!.getAttribute("aria-label")).toBe("Your trash");
    expect(viewer()!.contains(document.activeElement)).toBe(true);
    await escape();
    expect(viewer()).toBeNull();
    expect(document.activeElement).toBe(document.getElementById("pile"));
  });

  it("a click outside the pile closes it, a click on the pile does not (#700-2)", async () => {
    await mountOpen();
    await click(document.querySelector(".trash-viewer-grid")!);
    expect(viewer()).not.toBeNull();
    await click(viewer()!);
    expect(viewer()).toBeNull();
  });

  it("a card opened from the pile does not close the pile when clicked, and Escape closes only the card first (#700-2)", async () => {
    await mountOpen();
    await openCard();
    expect(inspect()).not.toBeNull();
    expect(inspect()!.contains(document.activeElement)).toBe(true);
    await click(inspect()!.querySelector(".card-inspect-art")!);
    expect(viewer()).not.toBeNull();
    expect(inspect()).not.toBeNull();
    await escape();
    expect(inspect()).toBeNull();
    expect(viewer()).not.toBeNull();
    expect(document.activeElement?.classList.contains("card-tile")).toBe(true);
    await escape();
    expect(viewer()).toBeNull();
  });
});

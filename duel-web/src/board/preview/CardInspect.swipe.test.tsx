// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CardInspect } from "./CardInspect";

let root: Root | null = null;
let host: HTMLElement | null = null;
const onClose = vi.fn();

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  onClose.mockClear();
});

const wait = () => new Promise((r) => setTimeout(r, 40));
const handle = () => document.querySelector<HTMLElement>(".card-inspect-handle")!;
const panel = () => document.querySelector<HTMLElement>(".card-inspect")!;

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<CardInspect defId="ST01-003" open onClose={onClose} />);
    await wait();
  });
}

/** Press on `from`, drag the pointer down by `dy`, and let go (jsdom has no PointerEvent, so mouse events carry the pointer types). */
async function drag(from: Element, dy: number) {
  const fire = (type: string, y: number) =>
    act(async () => {
      from.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientY: y }));
    });
  await fire("pointerdown", 100);
  await fire("pointermove", 100 + dy);
  await fire("pointerup", 100 + dy);
}

describe("CardInspect swipe to dismiss", () => {
  it("dragging the handle down 80px closes the sheet, a shorter drag does not (#708)", async () => {
    await mount();
    await drag(handle(), 79);
    expect(onClose).not.toHaveBeenCalled();
    await drag(handle(), 80);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the sheet follows the finger while dragging and snaps back on release (#708)", async () => {
    await mount();
    await act(async () => {
      handle().dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientY: 100 }));
      handle().dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientY: 130 }));
    });
    expect(panel().style.transform).toBe("translateY(30px)");
    await act(async () => {
      handle().dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientY: 130 }));
    });
    expect(panel().style.transform).toBe("");
  });
});

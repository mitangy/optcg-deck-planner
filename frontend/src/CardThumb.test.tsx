// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { CardThumb } from "./CardThumb";

const ART = "https://tcgplayer-cdn.tcgplayer.com/product/123456_200w.jpg";

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

const wait = () => new Promise((r) => setTimeout(r, 40));
const thumbBtn = () => document.querySelector<HTMLButtonElement>(".thumb-btn")!;
const lightbox = () => document.querySelector<HTMLElement>(".lightbox");

async function mountOpen() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<CardThumb src={ART} cardId="OP01-001" alt="Luffy" />));
  thumbBtn().focus();
  await act(async () => {
    thumbBtn().click();
    await wait();
  });
}

async function press(key: string) {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
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

describe("CardThumb lightbox", () => {
  it("opens as a named modal with the large art and focus inside (#700-2)", async () => {
    await mountOpen();
    expect(lightbox()!.getAttribute("role")).toBe("dialog");
    expect(lightbox()!.getAttribute("aria-label")).toBe("Expanded card art");
    expect(lightbox()!.querySelector("img.lightbox-img")!.getAttribute("src")).toContain("_in_1000x1000");
    expect(lightbox()!.contains(document.activeElement)).toBe(true);
  });

  it("Escape closes it and focus returns to the thumbnail (#700-2)", async () => {
    await mountOpen();
    await press("Escape");
    expect(lightbox()).toBeNull();
    expect(document.activeElement).toBe(thumbBtn());
  });

  it("a click on the art keeps it open, a click beside it closes it (#700-2)", async () => {
    await mountOpen();
    await click(lightbox()!.querySelector("img.lightbox-img")!);
    expect(lightbox()).not.toBeNull();
    await click(lightbox()!);
    expect(lightbox()).toBeNull();
  });

  it("the Close button closes it (#700-2)", async () => {
    await mountOpen();
    await click(lightbox()!.querySelector(".lightbox-close")!);
    expect(lightbox()).toBeNull();
  });
});

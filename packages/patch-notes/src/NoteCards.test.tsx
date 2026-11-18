// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { WhatsNewList } from "./WhatsNewList";
import type { PatchNote } from "./types";

const NOTE: PatchNote = {
  date: "2026-11-18",
  app: "both",
  title: "New alt art",
  text: "A new alt art.",
  cards: [{ id: "OP18-029", name: "Tony Tony.Chopper", label: "Alternate Art", image: "https://tcgplayer-cdn.tcgplayer.com/product/733606_400w.jpg" }],
};

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

function mount(cardHref?: (id: string) => string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<WhatsNewList notes={[NOTE]} cardHref={cardHref} />));
}

const thumb = () => host!.querySelector<HTMLButtonElement>("ul.wn-cards button")!;
const dialog = () => document.querySelector('[role="dialog"]');

describe("note cards (#1367)", () => {
  it("tapping a thumbnail opens the card enlarged (#1367)", () => {
    mount();
    expect(thumb().getAttribute("aria-label")).toBe("Enlarge Tony Tony.Chopper (Alternate Art)");
    expect(dialog()).toBeNull();
    act(() => thumb().click());
    const img = dialog()!.querySelector("img")!;
    expect(img.getAttribute("src")).toContain("733606_in_1000x1000");
    expect(dialog()!.textContent).toContain("Tony Tony.Chopper · OP18-029 · Alternate Art");
  });

  it("links to the card page only when the app gives a cardHref (#1367)", () => {
    mount((id) => `/cards/${id}`);
    act(() => thumb().click());
    expect(dialog()!.querySelector("a")!.getAttribute("href")).toBe("/cards/OP18-029");
    act(() => root!.unmount());
    host!.remove();
    mount();
    act(() => thumb().click());
    expect(dialog()!.querySelector("a")).toBeNull();
  });
});

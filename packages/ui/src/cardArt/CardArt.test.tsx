// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
// Every card currently has official art, so the card preview list can be empty: use a fixed one (#1299).
vi.mock("./previewArt.json", () => ({ default: ["OP18-003", "OP18-031"] }));

import { CardArt, CardArtImg } from "./CardArt";
import previewIds from "./previewArt.json";

const CDN = "https://tcgplayer-cdn.tcgplayer.com/product/123456_200w.jpg";
// Read from the manifest: the daily art sync retires previews once official art is up.
const PREVIEW_CARD = previewIds[0]!;
const OTHER = "https://example.test/a.png";

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

function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
}
const img = () => host!.querySelector("img");
const srcNow = () => img()?.getAttribute("src");
const fail = () => act(() => void img()!.dispatchEvent(new Event("error")));

/** Fires `load` for an image whose natural size is w x h. */
function load(w: number, h: number) {
  const el = img()!;
  Object.defineProperty(el, "naturalWidth", { value: w, configurable: true });
  Object.defineProperty(el, "naturalHeight", { value: h, configurable: true });
  act(() => void el.dispatchEvent(new Event("load")));
}

describe("CardArtImg", () => {
  it("steps through the resized art, the original, then the fallback as images fail", () => {
    mount(<CardArtImg src={CDN} cardId="OP01-001" fallback={<span>text</span>} />);
    expect(srcNow()).toContain("_400w");
    fail();
    expect(srcNow()).toBe(CDN);
    fail();
    expect(img()).toBeNull();
    expect(host!.textContent).toBe("text");
  });

  it("skips TCGplayer's landscape Image Coming Soon picture, which loads without an error", () => {
    mount(<CardArtImg src={CDN} cardId="OP01-001" fallback={<span>text</span>} />);
    load(400, 280);
    expect(srcNow()).toBe(CDN);
  });

  it("keeps a portrait picture", () => {
    mount(<CardArtImg src={CDN} cardId="OP01-001" />);
    load(400, 560);
    expect(srcNow()).toContain("_400w");
  });
});

describe("CardArtImg chain", () => {
  it("starts again from the first picture when the card changes", () => {
    mount(<CardArtImg src={CDN} cardId="OP01-001" />);
    fail();
    expect(srcNow()).toBe(CDN);
    const other = "https://tcgplayer-cdn.tcgplayer.com/product/654321_200w.jpg";
    act(() => root!.render(<CardArtImg src={other} cardId="OP01-002" />));
    expect(srcNow()).toContain("654321_400w");
  });

  it("takes the preview art from the given origin", () => {
    mount(<CardArtImg src={undefined} cardId={PREVIEW_CARD} origin="https://duel.test" />);
    expect(srcNow()).toBe(`https://duel.test/cards/preview/${PREVIEW_CARD}.webp`);
  });
});

describe("CardArt", () => {
  it("falls back to the local mirror once after the CDN fails, then to the text", () => {
    mount(<CardArt src={CDN} defId="OP01-001" fallback={<span>OP01-001</span>} />);
    expect(srcNow()).toBe(CDN);
    fail();
    expect(srcNow()).toBe("/cards/OP01-001.png");
    fail();
    expect(img()).toBeNull();
    expect(host!.textContent).toBe("OP01-001");
  });

  it("goes to the fallback when a non-CDN picture fails", () => {
    mount(<CardArt src={OTHER} defId="OP01-001" fallback={<span>text</span>} />);
    fail();
    expect(host!.textContent).toBe("text");
  });

  it("skips the placeholder picture a missing CDN product returns", () => {
    mount(<CardArt src={CDN} defId="OP01-001" fallback={<span>text</span>} />);
    load(200, 140);
    expect(srcNow()).toBe("/cards/OP01-001.png");
  });
});

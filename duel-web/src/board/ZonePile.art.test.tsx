// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { isPreviewArtPath } from "@optcg/ui/cardArt";
import { resolveCardImageUrl } from "../decks/artPrefs";
import { lifeFaceArt, ZonePile } from "./ZonePile";

// EB05 art is not on TCGplayer's CDN yet, so the first try 403s.
const EB05 = "EB05-001";

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

describe("zone pile art", () => {
  it("Trash pile top card falls back to preview art when TCGPlayer art fails (#604)", () => {
    const first = resolveCardImageUrl(EB05, { ownerSeat: 0, size: "thumb" })!;
    expect(first).toMatch(/^https:\/\/tcgplayer-cdn\./);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<ZonePile label="Trash" count={1} variant="trash" topDefId={EB05} ownerSeat={0} />));
    const img = host.querySelector<HTMLImageElement>(".zone-pile-face.top img, img.zone-pile-face.top")!;
    expect(img.getAttribute("src")).toBe(first);
    act(() => {
      img.dispatchEvent(new Event("error"));
    });
    const after = host.querySelector<HTMLImageElement>("img.zone-pile-face.top")!;
    expect(isPreviewArtPath(after.getAttribute("src"))).toBe(true);
    expect(after.getAttribute("src")).toContain(EB05);
  });

  it("Face-up Life art layers EB05 preview art under the TCGPlayer art (#604)", () => {
    const first = resolveCardImageUrl(EB05, { ownerSeat: 0, size: "thumb" })!;
    const layers = lifeFaceArt(EB05, 0).split(/,\s*(?=url\()/);
    expect(layers).toHaveLength(2);
    expect(layers[0]).toBe(`url("${first}")`);
    expect(layers[1]).toContain(EB05);
    expect(lifeFaceArt("OP01-016", 0).match(/url\(/g)).toHaveLength(1);
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { isPreviewArtPath } from "@optcg/ui/cardArt";
import previewIds from "../../../packages/ui/src/cardArt/previewArt.json";
import { resolveCardImageUrl } from "../decks/artPrefs";
import { lifeFaceArt, ZonePile } from "./ZonePile";

// A card with preview art and a TCGPlayer image in the catalog: the first try is the
// TCGPlayer CDN (which can 403 for new cards), then the thumbnail falls back to the preview.
// Taken from the preview list, so it follows sync_preview_art.py as previews come and go.
const PREVIEWED = previewIds[0]!;

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
    const first = resolveCardImageUrl(PREVIEWED, { ownerSeat: 0, size: "thumb" })!;
    expect(first).toMatch(/^https:\/\/tcgplayer-cdn\./);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<ZonePile label="Trash" count={1} variant="trash" topDefId={PREVIEWED} ownerSeat={0} />));
    const img = host.querySelector<HTMLImageElement>(".zone-pile-face.top img, img.zone-pile-face.top")!;
    expect(img.getAttribute("src")).toBe(first);
    act(() => {
      img.dispatchEvent(new Event("error"));
    });
    const after = host.querySelector<HTMLImageElement>("img.zone-pile-face.top")!;
    expect(isPreviewArtPath(after.getAttribute("src"))).toBe(true);
    expect(after.getAttribute("src")).toContain(PREVIEWED);
  });

  it("Face-up Life art layers EB05 preview art under the TCGPlayer art (#604)", () => {
    const first = resolveCardImageUrl(PREVIEWED, { ownerSeat: 0, size: "thumb" })!;
    const layers = lifeFaceArt(PREVIEWED, 0).split(/,\s*(?=url\()/);
    expect(layers).toHaveLength(2);
    expect(layers[0]).toBe(`url("${first}")`);
    expect(layers[1]).toContain(PREVIEWED);
    expect(lifeFaceArt("OP01-016", 0).match(/url\(/g)).toHaveLength(1);
  });
});

// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import type { PrintingView } from "./api";
import { AltArtsRow } from "./MarketPrice";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CARD_ID = "EB05-061";
const PREVIEW = `https://optcgduel.app/cards/preview/${CARD_ID}.webp`;
const alt: PrintingView = {
  product_id: 723148,
  name: "Alt art",
  market_price: null,
  low_price: null,
  image_url: `https://tcgplayer-cdn.tcgplayer.com/product/723148_200w.jpg`,
  tcgplayer_url: "",
  group_name: "",
  is_special: true,
  owned: 0,
};

/** Fails every image in the tile until its src is the card preview (or nothing is left). */
function exhaust(tile: Element): string | null {
  for (let i = 0; i < 10; i++) {
    const img = tile.querySelector("img.thumb");
    if (!img) return null;
    const src = img.getAttribute("src");
    if (src === PREVIEW) return src;
    act(() => {
      img.dispatchEvent(new Event("error"));
    });
  }
  throw new Error("art chain never ended");
}

function render() {
  const host = document.createElement("div");
  document.body.append(host);
  act(() => {
    createRoot(host).render(
      <QueryClientProvider client={new QueryClient()}>
        <AltArtsRow
          alts={[alt]}
          cardId={CARD_ID}
          base={{
            name: "Base",
            image_url: `https://tcgplayer-cdn.tcgplayer.com/product/999999_200w.jpg`,
            market_price: null,
            product_id: 999999,
          }}
        />
      </QueryClientProvider>,
    );
  });
  return host;
}

describe("AltArtsRow preview fallback", () => {
  it("an alt with no alt preview falls back to the card preview (#640)", () => {
    const tile = render().querySelector(".alt-art:not(.alt-art-base)")!;
    expect(exhaust(tile)).toBe(PREVIEW);
  });

  it("the Base tile ends on the card preview (#640)", () => {
    const tile = render().querySelector(".alt-art-base")!;
    expect(exhaust(tile)).toBe(PREVIEW);
  });
});

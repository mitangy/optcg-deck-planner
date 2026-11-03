// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import type { PrintingView } from "./api";
import { AltArtsRow } from "./MarketPrice";
import previewIds from "../../packages/ui/src/cardArt/previewArt.json";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A card id from the preview manifest (the daily art sync retires old ones).
const CARD_ID = previewIds[0]!;
const PREVIEW = `https://optcgduel.app/cards/preview/${CARD_ID}.webp`;
const alt: PrintingView = {
  product_id: 700001,
  name: "Alt art",
  market_price: null,
  low_price: null,
  image_url: `https://tcgplayer-cdn.tcgplayer.com/product/700001_200w.jpg`,
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
  it("an alt with no alt preview falls back to the card preview (#643)", () => {
    const tile = render().querySelector(".alt-art:not(.alt-art-base)")!;
    expect(exhaust(tile)).toBe(PREVIEW);
  });

  it("the Base tile ends on the card preview (#643)", () => {
    const tile = render().querySelector(".alt-art-base")!;
    expect(exhaust(tile)).toBe(PREVIEW);
  });
});

describe("AltArtsRow Show control (#702)", () => {
  function renderShow(shown: number | null, onShow: (id: number) => void) {
    const host = document.createElement("div");
    document.body.append(host);
    act(() => {
      createRoot(host).render(
        <QueryClientProvider client={new QueryClient()}>
          <AltArtsRow
            alts={[alt]}
            cardId={CARD_ID}
            base={{ name: "Base", image_url: "b.jpg", market_price: null, product_id: 999999 }}
            shownProductId={shown}
            onShow={onShow}
          />
        </QueryClientProvider>,
      );
    });
    return host;
  }

  it("clicking Show on an alt calls onShow with its product id (#702)", () => {
    const calls: number[] = [];
    const host = renderShow(null, (id) => calls.push(id));
    const btn = host.querySelector<HTMLButtonElement>(`button[aria-label="Show Alt art as the card's art"]`)!;
    act(() => btn.click());
    expect(calls).toEqual([alt.product_id]);
  });

  it("the shown tile has a Shown chip and no Show button (#702)", () => {
    const calls: number[] = [];
    const host = renderShow(alt.product_id, (id) => calls.push(id));
    const altTile = host.querySelector(".alt-art:not(.alt-art-base)")!;
    expect(altTile.querySelector(".alt-shown-chip")?.textContent).toBe("Shown");
    expect(altTile.querySelector("button.alt-show-btn")).toBeNull();
    const baseBtn = host.querySelector<HTMLButtonElement>(".alt-art-base button.alt-show-btn")!;
    act(() => baseBtn.click());
    expect(calls).toEqual([0]);
  });

  it("shows no Show controls without onShow, as on share pages (#702)", () => {
    const host = document.createElement("div");
    document.body.append(host);
    act(() => {
      createRoot(host).render(
        <QueryClientProvider client={new QueryClient()}>
          <AltArtsRow alts={[alt]} cardId={CARD_ID} shownProductId={alt.product_id} />
        </QueryClientProvider>,
      );
    });
    expect(host.querySelector(".alt-show-btn, .alt-shown-chip")).toBeNull();
  });
});

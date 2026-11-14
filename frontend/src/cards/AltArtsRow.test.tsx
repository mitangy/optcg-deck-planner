// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { PrintingView } from "../api";
import { AltArtsRow } from "./MarketPrice";
import previewIds from "../../../packages/ui/src/cardArt/previewArt.json";

// Every card currently has official art, so the card preview list can be empty: use a fixed one (#1299).
vi.mock("../../../packages/ui/src/cardArt/previewArt.json", () => ({ default: ["OP18-003", "OP18-031"] }));

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

describe("AltArtsRow collector toggle (#1035)", () => {
  function renderCollector(collector: number, onCollectorChange?: (id: number, qty: number) => void, wanted = 0) {
    const host = document.createElement("div");
    document.body.append(host);
    act(() => {
      createRoot(host).render(
        <QueryClientProvider client={new QueryClient()}>
          <AltArtsRow
            alts={[{ ...alt, collector, wanted }]}
            cardId={CARD_ID}
            base={{ name: "Base", image_url: "b.jpg", market_price: null, product_id: 999999 }}
            onCollectorChange={onCollectorChange}
          />
        </QueryClientProvider>,
      );
    });
    return host;
  }

  it("Extra copy on an alt tile asks for one extra copy, and the Base tile has no toggle (#1035)", () => {
    const calls: [number, number][] = [];
    const host = renderCollector(0, (id, qty) => calls.push([id, qty]));
    const btn = host.querySelector<HTMLButtonElement>(`button[aria-label="Want an extra Alt art on top of your decks"]`)!;
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    act(() => btn.click());
    expect(calls).toEqual([[alt.product_id, 1]]);
    expect(host.querySelector(".alt-art-base .alt-collector-btn, .alt-art-base .alt-collector")).toBeNull();
  });

  it("the pressed Extra copy toggle removes the extra copy (#1035)", () => {
    const calls: [number, number][] = [];
    const host = renderCollector(2, (id, qty) => calls.push([id, qty]));
    const btn = host.querySelector<HTMLButtonElement>(`button[aria-label="Remove extra Alt art"]`)!;
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.textContent).toBe("★ Extra copy ×2");
    act(() => btn.click());
    expect(calls).toEqual([[alt.product_id, 0]]);
  });

  it("without onCollectorChange the Extra copy mark stays a read-only label (#1035)", () => {
    const host = renderCollector(1);
    expect(host.querySelector(".alt-collector")?.textContent).toBe("★ Extra copy");
    expect(host.querySelector("button.alt-collector-btn")).toBeNull();
  });

  const press = (label: string | RegExp) => {
    const btn = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
      typeof label === "string" ? b.textContent === label : label.test(b.textContent ?? ""),
    );
    if (!btn) throw new Error(`no button ${label}`);
    act(() => btn.click());
  };

  it("an extra copy of the art the deck copy already uses asks first, and Cancel never saves it (#1165)", () => {
    const calls: [number, number][] = [];
    const host = renderCollector(0, (id, qty) => calls.push([id, qty]), 1);
    act(() => host.querySelector<HTMLButtonElement>(".alt-collector-btn")!.click());
    expect(document.body.textContent).toContain("Your deck copy is already this art. Add an extra one on top?");
    expect(calls).toEqual([]);
    press("Cancel");
    expect(calls).toEqual([]);
  });

  it("Add extra copy saves the extra copy once it is confirmed (#1165)", () => {
    const calls: [number, number][] = [];
    const host = renderCollector(0, (id, qty) => calls.push([id, qty]), 1);
    act(() => host.querySelector<HTMLButtonElement>(".alt-collector-btn")!.click());
    expect(calls).toEqual([]);
    press("Add extra copy");
    expect(calls).toEqual([[alt.product_id, 1]]);
  });

  it("an alt the deck does not use saves the extra copy at once, without asking (#1165)", () => {
    const calls: [number, number][] = [];
    const host = renderCollector(0, (id, qty) => calls.push([id, qty]), 0);
    act(() => host.querySelector<HTMLButtonElement>(".alt-collector-btn")!.click());
    expect(calls).toEqual([[alt.product_id, 1]]);
    expect(document.body.textContent).not.toContain("Add an extra one on top?");
  });

  it("the tile label reads Buying, so it fits a card with no deck (#1165)", () => {
    const host = document.createElement("div");
    document.body.append(host);
    act(() => {
      createRoot(host).render(
        <QueryClientProvider client={new QueryClient()}>
          <AltArtsRow alts={[{ ...alt, wanted: 2 }]} cardId={CARD_ID} showBuyPicks />
        </QueryClientProvider>,
      );
    });
    expect(host.querySelector(".alt-want-label")?.textContent).toBe("Buying ×2");
  });
});
